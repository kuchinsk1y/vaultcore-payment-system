import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { sql } from 'kysely';
import { fastify } from '../../src/app';
import { db } from '../../src/infrastructure/database';
import { MemoryMailer, setMailer } from '../../src/modules/security/mailer';
import { decryptSecret } from '../../src/modules/security/secret-box';
import { hotp, totpStep } from '../../src/modules/security/totp';

const mailer = new MemoryMailer();
const PASSWORD = 'CorrectHorse-Battery1';

// The strict per-route rate limiters are keyed by IP, so each request pretends to come from its own
let ipCounter = 1;
const nextIp = () => `10.20.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

type Cookies = Record<string, string>;
const cookiesOf = (res: { cookies: { name: string; value: string }[] }): Cookies =>
  Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));

async function call(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  options: { payload?: unknown; cookies?: Cookies; token?: string; headers?: Record<string, string> } = {},
) {
  const res = await fastify.inject({
    method,
    url,
    payload: options.payload as object | undefined,
    cookies: options.cookies,
    remoteAddress: nextIp(),
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });
  const text = res.payload;
  return { status: res.statusCode, body: text ? JSON.parse(text) : {}, cookies: cookiesOf(res), raw: res };
}

const newEmail = (label: string) => `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function register(email: string) {
  const res = await call('POST', '/auth/register', {
    payload: {
      email,
      password: PASSWORD,
      first_name: 'Test',
      last_name: 'User',
      phone_number: `+1${Math.floor(Math.random() * 1e10)}`,
      country: 'US',
    },
  });
  expect(res.status).toBe(201);
  return res;
}

const linkTokenFor = (email: string, param = 'token') => {
  const mail = mailer.lastTo(email);
  expect(mail, `an email to ${email}`).toBeDefined();
  const link = mail!.text.match(/https?:\/\/\S+/)![0];
  return new URL(link).searchParams.get(param)!;
};

async function verifyEmail(email: string) {
  const res = await call('POST', '/auth/email/verify', { payload: { token: linkTokenFor(email) } });
  expect(res.status).toBe(200);
}

async function login(email: string, extra: Record<string, unknown> = {}, password = PASSWORD) {
  return call('POST', '/auth/login', { payload: { email, password, ...extra } });
}

describe('Account security', () => {
  beforeAll(async () => {
    setMailer(mailer);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
  });

  describe('registration, cookies and email verification', () => {
    it('sets httpOnly session cookies and sends a verification email', async () => {
      const email = newEmail('reg');
      const res = await register(email);

      const setCookie = ([] as string[]).concat(res.raw.headers['set-cookie'] as string[]);
      expect(setCookie.some((c) => c.startsWith('paycore_session=') && /HttpOnly/i.test(c))).toBe(true);
      expect(setCookie.some((c) => c.startsWith('paycore_refresh=') && /HttpOnly/i.test(c))).toBe(true);
      expect(setCookie.every((c) => /SameSite=Strict/i.test(c))).toBe(true);

      expect(mailer.lastTo(email)?.subject).toMatch(/confirm your email/i);
    });

    it('authenticates with the cookie alone', async () => {
      const { cookies } = await register(newEmail('cookie'));
      const me = await call('GET', '/auth/me', { cookies });

      expect(me.status).toBe(200);
      expect(me.body.user.email_verified).toBe(false);
      expect(me.body.user.two_factor_enabled).toBe(false);
    });

    it('rejects cookie-authenticated writes from an untrusted origin', async () => {
      const { cookies } = await register(newEmail('csrf'));
      const res = await call('POST', '/auth/logout-all', { cookies, headers: { origin: 'https://evil.example' } });
      expect(res.status).toBe(403);
    });

    it('blocks transfers until the email is verified, and verification links work once', async () => {
      const email = newEmail('verify');
      const { cookies } = await register(email);

      const blocked = await call('POST', '/transfers', {
        cookies,
        headers: { 'idempotency-key': crypto.randomUUID() },
        payload: {
          source_account_id: crypto.randomUUID(),
          destination_account_id: crypto.randomUUID(),
          amount: 100,
          currency: 'EUR',
        },
      });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe('EMAIL_NOT_VERIFIED');

      const token = linkTokenFor(email);
      expect((await call('POST', '/auth/email/verify', { payload: { token } })).status).toBe(200);
      expect((await call('POST', '/auth/email/verify', { payload: { token } })).status).toBe(400);
      expect((await call('GET', '/auth/me', { cookies })).body.user.email_verified).toBe(true);
    });

    it('rejects an unknown verification token', async () => {
      const res = await call('POST', '/auth/email/verify', { payload: { token: 'x'.repeat(40) } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('failed logins and lockout', () => {
    it('locks the account after repeated failures, even for the right password, until the lock expires', async () => {
      const email = newEmail('lock');
      await register(email);

      for (let i = 0; i < 4; i++) {
        const res = await login(email, {}, 'wrong-password');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid credentials');
      }

      const fifth = await login(email, {}, 'wrong-password');
      expect(fifth.status).toBe(423);
      expect(fifth.body.code).toBe('ACCOUNT_LOCKED');

      const stillLocked = await login(email);
      expect(stillLocked.status).toBe(423);
      expect(stillLocked.raw.headers['retry-after']).toBeDefined();

      // Simulate the lock expiring
      await db.updateTable('users').set({ locked_until: new Date(Date.now() - 1000) }).where('email', '=', email).execute();
      const ok = await login(email);
      expect(ok.status).toBe(200);

      const user = await db.selectFrom('users').select('failed_login_attempts').where('email', '=', email).executeTakeFirstOrThrow();
      expect(user.failed_login_attempts).toBe(0);
    });

    it('answers identically for unknown emails and wrong passwords', async () => {
      const unknown = await login(newEmail('ghost'));
      expect(unknown.status).toBe(401);
      expect(unknown.body.message).toBe('Invalid credentials');
    });
  });

  describe('refresh tokens and sessions', () => {
    it('rotates the refresh token and detects reuse of an old one', async () => {
      const email = newEmail('refresh');
      await register(email);
      const first = (await login(email)).cookies;

      const rotated = await call('POST', '/auth/refresh', { cookies: first });
      expect(rotated.status).toBe(200);
      expect(rotated.cookies.paycore_refresh).toBeDefined();
      expect(rotated.cookies.paycore_refresh).not.toBe(first.paycore_refresh);
      expect((await call('GET', '/auth/me', { cookies: rotated.cookies })).status).toBe(200);

      // The previous refresh token is now worthless, and replaying it kills the whole session
      const replay = await call('POST', '/auth/refresh', { cookies: first });
      expect(replay.status).toBe(401);
      expect((await call('GET', '/auth/me', { cookies: rotated.cookies })).status).toBe(401);
      expect((await call('POST', '/auth/refresh', { cookies: rotated.cookies })).status).toBe(401);
    });

    it('rejects a refresh without a cookie', async () => {
      expect((await call('POST', '/auth/refresh')).status).toBe(401);
    });

    it('lists sessions, revokes another one, and logs out everywhere', async () => {
      const email = newEmail('sessions');
      await register(email);
      const laptop = (await login(email)).cookies;
      const phone = (await login(email)).cookies;

      const list = await call('GET', '/auth/sessions', { cookies: laptop });
      expect(list.status).toBe(200);
      expect(list.body.sessions.length).toBeGreaterThanOrEqual(3);
      expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

      const phoneSession = (await call('GET', '/auth/sessions', { cookies: phone })).body.sessions.find(
        (s: { current: boolean }) => s.current,
      );
      const revoke = await call('DELETE', `/auth/sessions/${phoneSession.id}`, { cookies: laptop });
      expect(revoke.status).toBe(200);
      expect((await call('GET', '/auth/me', { cookies: phone })).status).toBe(401);
      expect((await call('GET', '/auth/me', { cookies: laptop })).status).toBe(200);

      const all = await call('POST', '/auth/logout-all', { cookies: laptop });
      expect(all.status).toBe(200);
      expect((await call('GET', '/auth/me', { cookies: laptop })).status).toBe(401);
    });

    it('does not let a user revoke someone else\'s session', async () => {
      const a = await register(newEmail('owner'));
      const b = await register(newEmail('intruder'));
      const target = (await call('GET', '/auth/sessions', { cookies: a.cookies })).body.sessions[0];

      const res = await call('DELETE', `/auth/sessions/${target.id}`, { cookies: b.cookies });
      expect(res.status).toBe(404);
      expect((await call('GET', '/auth/me', { cookies: a.cookies })).status).toBe(200);
    });

    it('logout revokes the session server-side', async () => {
      const { cookies } = await register(newEmail('logout'));
      const res = await call('POST', '/auth/logout', { cookies });

      expect(res.status).toBe(200);
      expect((await call('GET', '/auth/me', { cookies })).status).toBe(401);
    });
  });

  describe('password reset and change', () => {
    it('resets the password with a single-use link and signs out every device', async () => {
      const email = newEmail('reset');
      const { cookies } = await register(email);

      const requested = await call('POST', '/auth/password/forgot', { payload: { email } });
      expect(requested.status).toBe(200);
      const token = linkTokenFor(email);

      const done = await call('POST', '/auth/password/reset', { payload: { token, password: 'Brand-New-Passw0rd' } });
      expect(done.status).toBe(200);
      expect((await call('POST', '/auth/password/reset', { payload: { token, password: 'Another-Passw0rd-2' } })).status).toBe(400);

      expect((await call('GET', '/auth/me', { cookies })).status).toBe(401);
      expect((await login(email)).status).toBe(401);
      expect((await login(email, {}, 'Brand-New-Passw0rd')).status).toBe(200);
    });

    it('does not reveal whether an email is registered', async () => {
      const before = mailer.sent.length;
      const res = await call('POST', '/auth/password/forgot', { payload: { email: newEmail('nobody') } });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account exists/i);
      expect(mailer.sent.length).toBe(before);
    });

    it('rejects weak or oversized new passwords', async () => {
      const email = newEmail('weak');
      await register(email);
      await call('POST', '/auth/password/forgot', { payload: { email } });
      const token = linkTokenFor(email);

      expect((await call('POST', '/auth/password/reset', { payload: { token, password: 'short' } })).status).toBe(400);
      expect((await call('POST', '/auth/password/reset', { payload: { token, password: 'x'.repeat(100) } })).status).toBe(400);
    });

    it('changes the password, keeping only the current session', async () => {
      const email = newEmail('change');
      await register(email);
      const current = (await login(email)).cookies;
      const other = (await login(email)).cookies;

      const wrong = await call('POST', '/auth/password/change', {
        cookies: current,
        payload: { current_password: 'nope-nope-nope', new_password: 'Changed-Passw0rd-1' },
      });
      expect(wrong.status).toBe(400);

      const ok = await call('POST', '/auth/password/change', {
        cookies: current,
        payload: { current_password: PASSWORD, new_password: 'Changed-Passw0rd-1' },
      });
      expect(ok.status).toBe(200);
      expect((await call('GET', '/auth/me', { cookies: current })).status).toBe(200);
      expect((await call('GET', '/auth/me', { cookies: other })).status).toBe(401);
      expect((await login(email, {}, 'Changed-Passw0rd-1')).status).toBe(200);
    });
  });

  describe('two-factor authentication (TOTP)', () => {
    async function enable2fa(email: string, cookies: Cookies) {
      const setup = await call('POST', '/auth/2fa/setup', { cookies });
      expect(setup.status).toBe(200);
      expect(setup.body.otpauth_uri).toMatch(/^otpauth:\/\/totp\//);
      const secret: string = setup.body.secret;

      const wrong = await call('POST', '/auth/2fa/enable', { cookies, payload: { code: '000000' } });
      expect([400]).toContain(wrong.status);

      const step = totpStep(Date.now());
      const enabled = await call('POST', '/auth/2fa/enable', { cookies, payload: { code: hotp(secret, step) } });
      expect(enabled.status).toBe(200);
      return { secret, step };
    }

    it('stores the secret encrypted, then requires a code at login', async () => {
      const email = newEmail('2fa');
      const { cookies } = await register(email);
      const { secret, step } = await enable2fa(email, cookies);

      const row = await db.selectFrom('users').select('totp_secret_encrypted').where('email', '=', email).executeTakeFirstOrThrow();
      expect(row.totp_secret_encrypted).not.toContain(secret);
      expect(decryptSecret(row.totp_secret_encrypted!)).toBe(secret);

      const noCode = await login(email);
      expect(noCode.status).toBe(401);
      expect(noCode.body.code).toBe('MFA_REQUIRED');

      const badCode = await login(email, { totp_code: '123456' });
      expect(badCode.status).toBe(401);
      expect(badCode.body.code).toBe('INVALID_CODE');

      // The code used to enable 2FA cannot be replayed; the next step's code works
      expect((await login(email, { totp_code: hotp(secret, step) })).status).toBe(401);
      const ok = await login(email, { totp_code: hotp(secret, step + 1) });
      expect(ok.status).toBe(200);
      expect(ok.cookies.paycore_session).toBeDefined();
    });

    it('counts wrong codes towards the lockout', async () => {
      const email = newEmail('2fa-lock');
      const { cookies } = await register(email);
      await enable2fa(email, cookies);

      let last = 0;
      for (let i = 0; i < 5; i++) last = (await login(email, { totp_code: '111111' })).status;
      expect(last).toBe(423);
    });

    it('disabling needs the password and a valid code', async () => {
      const email = newEmail('2fa-off');
      const { cookies } = await register(email);
      const { secret, step } = await enable2fa(email, cookies);

      const badPassword = await call('POST', '/auth/2fa/disable', {
        cookies,
        payload: { password: 'wrong-password', code: hotp(secret, step + 1) },
      });
      expect(badPassword.status).toBe(400);

      const off = await call('POST', '/auth/2fa/disable', {
        cookies,
        payload: { password: PASSWORD, code: hotp(secret, step + 1) },
      });
      expect(off.status).toBe(200);
      expect((await login(email)).status).toBe(200);
    });
  });

  describe('confirmation of large transfers', () => {
    const LARGE = 150_000; // above the default 100000 threshold

    async function setupSender(label: string) {
      const email = newEmail(label);
      const reg = await register(email);
      await verifyEmail(email);

      const [ledgerTx] = await db.insertInto('ledger_transactions').values({ description: 'Funding' }).returning('id').execute();
      await db
        .insertInto('ledger_entries')
        .values({
          ledger_transaction_id: ledgerTx.id,
          account_id: reg.body.defaultAccount.id,
          direction: 'CREDIT',
          amount: 1_000_000,
          currency: 'EUR',
        })
        .execute();

      const receiver = await register(newEmail(`${label}-rcv`));
      return { email, cookies: reg.cookies, sourceId: reg.body.defaultAccount.id as string, destId: receiver.body.defaultAccount.id as string };
    }

    const transfer = (
      ctx: { cookies: Cookies; sourceId: string; destId: string },
      extra: Record<string, unknown> = {},
      key = crypto.randomUUID(),
    ) =>
      call('POST', '/transfers', {
        cookies: ctx.cookies,
        headers: { 'idempotency-key': key },
        payload: { source_account_id: ctx.sourceId, destination_account_id: ctx.destId, amount: LARGE, currency: 'EUR', ...extra },
      });

    const codeFromEmail = (email: string) => mailer.lastTo(email)!.text.match(/code is (\d{6})/)![1];

    it('lets small transfers through without a code', async () => {
      const ctx = await setupSender('small');
      const res = await transfer(ctx, { amount: 5_000 });
      expect(res.status).toBe(201);
    });

    it('asks for an emailed code, then completes with the same idempotency key', async () => {
      const ctx = await setupSender('large');
      const key = crypto.randomUUID();

      const first = await transfer(ctx, {}, key);
      expect(first.status).toBe(202);
      expect(first.body.status).toBe('CONFIRMATION_REQUIRED');
      expect(first.body.method).toBe('EMAIL_OTP');
      const code = codeFromEmail(ctx.email);

      // A wrong code can be corrected with the same key (errors are not cached for confirmations)
      const wrong = await transfer(ctx, { confirmation_id: first.body.confirmation_id, confirmation_code: code === '000000' ? '111111' : '000000' }, key);
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('CONFIRMATION_INVALID');

      const done = await transfer(ctx, { confirmation_id: first.body.confirmation_id, confirmation_code: code }, key);
      expect(done.status).toBe(201);
      expect(done.body.status).toBe('SUCCESS');

      // The code is single-use
      const again = await transfer(ctx, { confirmation_id: first.body.confirmation_id, confirmation_code: code });
      expect(again.status).toBe(400);
    });

    it('binds the code to the exact transfer details', async () => {
      const ctx = await setupSender('bound');
      const first = await transfer(ctx);
      const code = codeFromEmail(ctx.email);

      const tampered = await transfer(ctx, { amount: LARGE + 1, confirmation_id: first.body.confirmation_id, confirmation_code: code });
      expect(tampered.status).toBe(400);
      expect(tampered.body.code).toBe('CONFIRMATION_INVALID');
    });

    it('locks a confirmation after too many wrong guesses', async () => {
      const ctx = await setupSender('guess');
      const first = await transfer(ctx);
      const code = codeFromEmail(ctx.email);
      const wrongCode = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await transfer(ctx, { confirmation_id: first.body.confirmation_id, confirmation_code: wrongCode });
      }
      const afterLimit = await transfer(ctx, { confirmation_id: first.body.confirmation_id, confirmation_code: code });
      expect(afterLimit.status).toBe(400);
    });

    it('uses the authenticator app instead of email when 2FA is enabled', async () => {
      const ctx = await setupSender('large-2fa');
      const setup = await call('POST', '/auth/2fa/setup', { cookies: ctx.cookies });
      const step = totpStep(Date.now());
      await call('POST', '/auth/2fa/enable', { cookies: ctx.cookies, payload: { code: hotp(setup.body.secret, step) } });

      const mailsBefore = mailer.sent.length;
      const first = await transfer(ctx);
      expect(first.status).toBe(202);
      expect(first.body.method).toBe('TOTP');
      expect(mailer.sent.length).toBe(mailsBefore); // nothing emailed

      const done = await transfer(ctx, {
        confirmation_id: first.body.confirmation_id,
        confirmation_code: hotp(setup.body.secret, step + 1),
      });
      expect(done.status).toBe(201);
    });

    it('rejects a confirmation that belongs to another user', async () => {
      const owner = await setupSender('owner-conf');
      const thief = await setupSender('thief-conf');
      const first = await transfer(owner);
      const code = codeFromEmail(owner.email);

      const res = await transfer(thief, { confirmation_id: first.body.confirmation_id, confirmation_code: code });
      expect(res.status).toBe(400);
    });
  });

  describe('audit log', () => {
    it('records sensitive actions for the user', async () => {
      const email = newEmail('audit');
      const reg = await register(email);
      await login(email, {}, 'wrong-password');
      await login(email);

      const res = await call('GET', '/auth/audit-log', { cookies: reg.cookies });
      expect(res.status).toBe(200);

      const actions: string[] = res.body.entries.map((e: { action: string }) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['auth.register', 'auth.login.failed', 'auth.login.success']));

      const failed = res.body.entries.find((e: { action: string }) => e.action === 'auth.login.failed');
      expect(failed.ip).toBeTruthy();
    });

    it('only shows a user their own entries', async () => {
      const a = await register(newEmail('audit-a'));
      const b = await register(newEmail('audit-b'));
      const mine = await call('GET', '/auth/audit-log', { cookies: a.cookies });
      const theirs = await call('GET', '/auth/audit-log', { cookies: b.cookies });

      const userA = (await call('GET', '/auth/me', { cookies: a.cookies })).body.user.id;
      expect(mine.body.entries.length).toBeGreaterThan(0);
      const idsA = new Set(mine.body.entries.map((e: { id: string }) => e.id));
      expect(theirs.body.entries.every((e: { id: string }) => !idsA.has(e.id))).toBe(true);
      expect(userA).toBeTruthy();
    });

    it('is append-only at the database level', async () => {
      await register(newEmail('audit-immutable'));
      await expect(sql`UPDATE audit_log SET action = 'tampered'`.execute(db)).rejects.toThrow(/append-only/);
      await expect(sql`DELETE FROM audit_log`.execute(db)).rejects.toThrow(/append-only/);
    });
  });
});
