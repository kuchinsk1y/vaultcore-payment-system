"use client";

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck } from 'lucide-react';
import { ApiException, beginTwoFactorSetup, disableTwoFactor, enableTwoFactor } from '@/lib/api';

interface Props {
  enabled: boolean;
  onChange: () => void;
}

type Setup = { secret: string; otpauthUri: string };

const errorMessage = (err: unknown) => (err instanceof ApiException ? err.message : 'Something went wrong.');
const inputClass = 'input-premium p-4 rounded-xl bg-transparent border border-[var(--border-subtle)] text-[var(--text-main)]';

export function TwoFactorSection({ enabled, onChange }: Props) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const res = await beginTwoFactorSetup();
      setSetup({ secret: res.secret, otpauthUri: res.otpauth_uri });
    });

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await enableTwoFactor(code);
      setSetup(null);
      setCode('');
      onChange();
    });
  };

  const disable = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await disableTwoFactor(password, code);
      setDisabling(false);
      setPassword('');
      setCode('');
      onChange();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className={`w-5 h-5 ${enabled ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} aria-hidden />
        <p className="text-sm text-[var(--text-main)]">
          Authenticator app is <strong>{enabled ? 'on' : 'off'}</strong>.{' '}
          <span className="text-[var(--text-muted)]">
            {enabled
              ? 'You need a code to sign in and to confirm large transfers.'
              : 'Add a second step to sign in and to confirm large transfers.'}
          </span>
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {!enabled && !setup && (
        <button onClick={start} disabled={busy} className="btn-luxury px-6 py-3 text-xs tracking-[0.1em] uppercase disabled:opacity-50">
          Set up two-factor
        </button>
      )}

      {!enabled && setup && (
        <form onSubmit={confirm} className="space-y-4 max-w-md">
          <p className="text-sm text-[var(--text-muted)]">
            Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows.
          </p>
          <div className="inline-block bg-white p-3 rounded-lg" aria-label="Two-factor QR code">
            <QRCodeSVG value={setup.otpauthUri} size={168} />
          </div>
          <p className="text-xs text-[var(--text-muted)] break-all">
            Can&apos;t scan? Enter this key manually: <code className="text-[var(--text-main)]">{setup.secret}</code>
          </p>
          <div className="flex gap-3 items-center">
            <label htmlFor="totp-confirm" className="sr-only">6-digit code</label>
            <input
              id="totp-confirm"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className={`${inputClass} w-40 tracking-[0.4em] text-center tabular-nums`}
              required
            />
            <button type="submit" disabled={busy || code.length !== 6} className="btn-luxury px-6 py-3 text-xs tracking-[0.1em] uppercase disabled:opacity-50">
              Turn on
            </button>
            <button type="button" onClick={() => { setSetup(null); setCode(''); }} className="text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      {enabled && !disabling && (
        <button onClick={() => setDisabling(true)} className="text-xs uppercase tracking-widest text-red-500 hover:text-red-400">
          Turn off two-factor
        </button>
      )}

      {enabled && disabling && (
        <form onSubmit={disable} className="space-y-3 max-w-md">
          <p className="text-sm text-[var(--text-muted)]">Confirm with your password and a current authenticator code.</p>
          <label htmlFor="disable-password" className="sr-only">Password</label>
          <input id="disable-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={`${inputClass} w-full`} required />
          <label htmlFor="disable-code" className="sr-only">6-digit code</label>
          <input id="disable-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${inputClass} w-40 tracking-[0.4em] text-center tabular-nums`} required />
          <div className="flex gap-3">
            <button type="submit" disabled={busy || code.length !== 6 || !password} className="btn-luxury px-6 py-3 text-xs tracking-[0.1em] uppercase disabled:opacity-50">
              Turn off
            </button>
            <button type="button" onClick={() => { setDisabling(false); setCode(''); setPassword(''); }} className="text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
