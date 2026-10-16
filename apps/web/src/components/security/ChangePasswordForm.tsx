"use client";

import { useState } from 'react';
import { ApiException, changePassword } from '@/lib/api';

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });

  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setStatus({ kind: 'saving' });
    try {
      const res = await changePassword(current, next);
      setStatus({ kind: 'ok', message: res.message });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof ApiException ? err.message : 'Could not change the password.' });
    }
  };

  const fieldClass = 'input-premium w-full p-4 rounded-xl bg-transparent border border-[var(--border-subtle)] text-[var(--text-main)]';
  const labelClass = 'text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]';

  return (
    <form onSubmit={submit} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <label htmlFor="current-password" className={labelClass}>Current Password</label>
        <input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={fieldClass} required />
      </div>
      <div className="space-y-2">
        <label htmlFor="new-password" className={labelClass}>New Password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} className={fieldClass} required />
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm-password" className={labelClass}>Repeat New Password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldClass} required aria-invalid={mismatch} />
        {mismatch && <p className="text-xs text-red-500">Passwords do not match.</p>}
      </div>

      {status.kind === 'error' && <p role="alert" className="text-sm text-red-500">{status.message}</p>}
      {status.kind === 'ok' && <p role="status" className="text-sm text-emerald-500">{status.message}</p>}

      <button type="submit" disabled={status.kind === 'saving' || mismatch || next.length < 8} className="btn-luxury px-6 py-3 text-xs tracking-[0.1em] uppercase disabled:opacity-50">
        {status.kind === 'saving' ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  );
}
