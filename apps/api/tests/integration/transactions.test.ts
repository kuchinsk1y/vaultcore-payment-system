import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { sql } from 'kysely';
import { fastify } from '../../src/app';
import { db } from '../../src/infrastructure/database';
import { issueTestToken } from '../helpers/auth';
import { seedSystemData } from '../helpers/seed';

let ipCounter = 1;
const nextIp = () => `10.30.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function call(
  method: 'GET' | 'POST',
  url: string,
  token: string,
  payload?: object,
  headers: Record<string, string> = {},
) {
  const res = await fastify.inject({
    method,
    url,
    payload,
    remoteAddress: nextIp(),
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
  return { status: res.statusCode, body: res.payload && res.headers['content-type']?.toString().includes('json') ? JSON.parse(res.payload) : res.payload, headers: res.headers };
}

interface Actor {
  id: string;
  name: string;
  token: string;
  eur: string;
  usd: string;
}

async function createActor(label: string, fullName: string): Promise<Actor> {
  const user = await db
    .insertInto('users')
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`, full_name: fullName, email_verified_at: new Date() })
    .returning('id')
    .executeTakeFirstOrThrow();
  const eur = await db.insertInto('accounts').values({ user_id: user.id, currency: 'EUR' }).returning('id').executeTakeFirstOrThrow();
  const usd = await db.insertInto('accounts').values({ user_id: user.id, currency: 'USD' }).returning('id').executeTakeFirstOrThrow();
  return { id: user.id, name: fullName, token: await issueTestToken(user.id), eur: eur.id, usd: usd.id };
}

const topUp = (actor: Actor, accountId: string, amount: number) =>
  call('POST', `/accounts/${accountId}/top-up`, actor.token, { amount });

const sendTransfer = (from: Actor, toAccount: string, amount: number) =>
  call('POST', '/transfers', from.token, { source_account_id: from.eur, destination_account_id: toAccount, amount, currency: 'EUR' }, { 'idempotency-key': crypto.randomUUID() });

describe('Transactions history and top-ups', () => {
  let ada: Actor;
  let bob: Actor;
  let eve: Actor;

  beforeAll(async () => {
    await fastify.ready();
    await sql`TRUNCATE TABLE ledger_entries, ledger_transactions, transfers, accounts, users, idempotency_keys, risk_logs CASCADE`.execute(db);
    await seedSystemData();

    ada = await createActor('ada', 'Ada Lovelace');
    bob = await createActor('bob', '=HYPERLINK("http://evil.example","click")');
    eve = await createActor('eve', 'Eve Intruder');

    // Ada: top-up, pay Bob twice, exchange EUR -> USD
    expect((await topUp(ada, ada.eur, 100_000)).status).toBe(201);
    expect((await sendTransfer(ada, bob.eur, 1_000)).status).toBe(201);
    expect((await sendTransfer(ada, bob.eur, 2_500)).status).toBe(201);
    const fx = await call('POST', '/fx/convert', ada.token, { source_account_id: ada.eur, destination_account_id: ada.usd, amount: 5_000 });
    expect(fx.status).toBe(200);
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
  });

  afterEach(() => {
    delete process.env.ENABLE_DEMO_TOPUP;
  });

  describe('GET /transactions', () => {
    it('requires authentication', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/transactions' });
      expect(res.statusCode).toBe(401);
    });

    it('lists the newest operations first with kinds and counterparties', async () => {
      const res = await call('GET', '/transactions?limit=50', ada.token);
      expect(res.status).toBe(200);

      const items = res.body.items as { kind: string; direction: string; amount_minor: number; currency: string; counterparty: { name: string; is_self: boolean } | null; date: string }[];
      expect(items.map((i) => i.kind)).toEqual(['EXCHANGE', 'EXCHANGE', 'TRANSFER', 'TRANSFER', 'TOP_UP']);

      // newest first
      const dates = items.map((i) => new Date(i.date).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => b - a));

      const transfers = items.filter((i) => i.kind === 'TRANSFER');
      expect(transfers.map((t) => t.amount_minor).sort()).toEqual([1_000, 2_500]);
      expect(transfers.every((t) => t.direction === 'DEBIT' && t.counterparty?.name === bob.name && !t.counterparty.is_self)).toBe(true);

      // The system clearing account is bookkeeping, never a counterparty: a top-up has none, and an
      // exchange's only other party is the user's own second account
      expect(items.find((i) => i.kind === 'TOP_UP')?.counterparty).toBeNull();
      expect(items.filter((i) => i.kind === 'EXCHANGE').every((i) => i.counterparty?.is_self === true)).toBe(true);
      expect(items.find((i) => i.kind === 'TOP_UP')).toMatchObject({ direction: 'CREDIT', amount_minor: 100_000, currency: 'EUR' });
    });

    it('shows the receiving side to the other user', async () => {
      const res = await call('GET', '/transactions', bob.token);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0]).toMatchObject({
        kind: 'TRANSFER',
        direction: 'CREDIT',
        counterparty: { name: ada.name, is_self: false },
      });
    });

    it('never leaks another user\'s operations', async () => {
      const res = await call('GET', '/transactions', eve.token);
      expect(res.body.items).toEqual([]);
      expect(res.body.next_cursor).toBeNull();

      // Filtering by someone else's account yields nothing rather than their data
      const foreign = await call('GET', `/transactions?account_id=${ada.eur}`, eve.token);
      expect(foreign.body.items).toEqual([]);
    });

    it('pages with an exact keyset cursor: no gaps, no duplicates', async () => {
      const all = (await call('GET', '/transactions?limit=100', ada.token)).body.items as { id: string }[];

      const collected: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = `/transactions?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const res = await call('GET', url, ada.token);
        expect(res.status).toBe(200);
        collected.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.next_cursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(collected).toEqual(all.map((i) => i.id));
      expect(new Set(collected).size).toBe(collected.length);
    });

    it('filters by direction, kind, account and date', async () => {
      const credits = await call('GET', '/transactions?direction=CREDIT', ada.token);
      expect(credits.body.items.map((i: { kind: string }) => i.kind).sort()).toEqual(['EXCHANGE', 'TOP_UP']);

      const exchanges = await call('GET', '/transactions?kind=EXCHANGE', ada.token);
      expect(exchanges.body.items).toHaveLength(2);

      const usdOnly = await call('GET', `/transactions?account_id=${ada.usd}`, ada.token);
      expect(usdOnly.body.items).toHaveLength(1);
      expect(usdOnly.body.items[0].currency).toBe('USD');

      const future = await call('GET', `/transactions?from=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`, ada.token);
      expect(future.body.items).toEqual([]);

      const past = await call('GET', `/transactions?to=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}`, ada.token);
      expect(past.body.items).toEqual([]);
    });

    it('searches by counterparty name, and treats wildcards literally', async () => {
      const byName = await call('GET', '/transactions?q=hyperlink', ada.token);
      expect(byName.body.items).toHaveLength(2);

      const none = await call('GET', '/transactions?q=zzz-nobody', ada.token);
      expect(none.body.items).toEqual([]);

      // "%" must not behave as a match-everything wildcard
      const wildcard = await call('GET', `/transactions?q=${encodeURIComponent('%')}`, ada.token);
      expect(wildcard.body.items).toEqual([]);
    });

    it.each([
      ['limit=0'],
      ['limit=1000'],
      ['direction=UP'],
      ['kind=GIFT'],
      ['account_id=not-a-uuid'],
      ['from=2026-02-01&to=2026-01-01'],
      ['cursor=garbage'],
    ])('rejects bad input: %s', async (query) => {
      const res = await call('GET', `/transactions?${query}`, ada.token);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /transactions/export', () => {
    it('downloads a CSV with a header and neutralised formulas', async () => {
      const res = await call('GET', '/transactions/export', ada.token);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="transactions-\d{4}-\d{2}-\d{2}\.csv"/);

      const text = res.body as string;
      expect(text.startsWith('﻿Date,Type,Description,Counterparty,Account,Amount,Currency')).toBe(true);
      expect(text.trim().split('\r\n')).toHaveLength(6); // header + 5 rows

      // Bob's name starts with "=": it must be exported as text, not as a formula
      expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
      expect(text).toContain(',-10.00,EUR');
      expect(text).toContain(',1000.00,EUR');
    });

    it('applies the same filters and is scoped to the caller', async () => {
      const filtered = await call('GET', '/transactions/export?kind=TOP_UP', ada.token);
      expect((filtered.body as string).trim().split('\r\n')).toHaveLength(2);

      const other = await call('GET', '/transactions/export', eve.token);
      expect((other.body as string).trim().split('\r\n')).toHaveLength(1); // header only
    });

    it('is recorded in the audit log', async () => {
      const entries = await db.selectFrom('audit_log').select('action').where('user_id', '=', ada.id).execute();
      expect(entries.map((e) => e.action)).toContain('transactions.exported');
    });
  });

  describe('POST /accounts/:id/top-up', () => {
    it('credits the account through a balanced double-entry transaction', async () => {
      const user = await createActor('balanced', 'Balanced User');
      const res = await topUp(user, user.eur, 25_000);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ amount_minor: 25_000, currency: 'EUR', account_id: user.eur });

      const legs = await db.selectFrom('ledger_entries').select(['direction', 'amount', 'account_id']).where('ledger_transaction_id', '=', res.body.transaction_id).execute();
      expect(legs).toHaveLength(2);
      const debit = legs.find((l) => l.direction === 'DEBIT')!;
      const credit = legs.find((l) => l.direction === 'CREDIT')!;
      expect(Number(debit.amount)).toBe(Number(credit.amount));
      expect(credit.account_id).toBe(user.eur);
      expect(debit.account_id).toBe('11111111-0000-0000-0000-000000000000'); // EUR clearing account

      const tx = await db.selectFrom('ledger_transactions').select('kind').where('id', '=', res.body.transaction_id).executeTakeFirstOrThrow();
      expect(tx.kind).toBe('TOP_UP');

      const accounts = await call('GET', '/accounts', user.token);
      expect(accounts.body.find((a: { id: string }) => a.id === user.eur).balance).toBe(250);
    });

    it('enforces the per-request limit', async () => {
      const user = await createActor('perreq', 'Limit User');
      const res = await topUp(user, user.eur, 500_001);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('LIMIT_EXCEEDED');
    });

    it('enforces the rolling 24h limit, including under concurrency', async () => {
      const user = await createActor('daily', 'Daily User');

      // 20 000.00 per 24h in 500.00 steps allows exactly 40 top-ups; fire 45 at once
      const results = await Promise.all(Array.from({ length: 45 }, () => topUp(user, user.eur, 50_000)));
      const created = results.filter((r) => r.status === 201).length;
      const refused = results.filter((r) => r.status === 400 && r.body.code === 'LIMIT_EXCEEDED').length;
      const throttled = results.filter((r) => r.status === 429).length;

      // The IP rate limiter is per address and each call has its own, so nothing is throttled here
      expect(throttled).toBe(0);
      expect(created).toBe(40);
      expect(refused).toBe(5);

      const total = await db
        .selectFrom('ledger_entries')
        .select(sql<string>`SUM(amount)`.as('total'))
        .where('account_id', '=', user.eur)
        .where('direction', '=', 'CREDIT')
        .executeTakeFirstOrThrow();
      expect(Number(total.total)).toBe(2_000_000);
    });

    it('rejects invalid amounts', async () => {
      const user = await createActor('invalid', 'Invalid User');
      for (const amount of [0, -5, 10.5, '100', null]) {
        const res = await call('POST', `/accounts/${user.eur}/top-up`, user.token, { amount } as object);
        expect(res.status).toBe(400);
      }
    });

    it('does not allow topping up someone else\'s account', async () => {
      const res = await topUp(eve, ada.eur, 1_000);
      expect(res.status).toBe(404);
    });

    it('can be switched off', async () => {
      process.env.ENABLE_DEMO_TOPUP = 'false';
      const user = await createActor('off', 'Off User');
      const res = await topUp(user, user.eur, 1_000);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TOPUP_DISABLED');

      const options = await call('GET', '/accounts/options', user.token);
      expect(options.body.top_up.enabled).toBe(false);
    });

    it('requires authentication', async () => {
      const res = await fastify.inject({ method: 'POST', url: `/accounts/${ada.eur}/top-up`, payload: { amount: 100 } });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('account options and currencies', () => {
    it('lists the supported currencies and top-up rules', async () => {
      const res = await call('GET', '/accounts/options', ada.token);
      expect(res.status).toBe(200);
      expect(res.body.currencies).toEqual(['EUR', 'PLN', 'USD']);
      expect(res.body.top_up).toEqual({ enabled: true, max_per_request: 500_000, max_per_24h: 2_000_000 });
    });

    it('refuses to open an account in an unsupported currency', async () => {
      const res = await call('POST', '/accounts', eve.token, { currency: 'GBP' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unsupported currency/i);
    });

    it('opens an account in a supported currency, case-insensitively', async () => {
      const res = await call('POST', '/accounts', eve.token, { currency: 'pln' });
      expect(res.status).toBe(201);
      expect(res.body.currency).toBe('PLN');
    });
  });
});
