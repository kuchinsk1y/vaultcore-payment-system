'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { resetPassword, ApiException } from '@/lib/api';
import { AuthMessage, AuthShell, authButtonClass, authInputClass } from '@/components/auth/AuthShell';

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return <AuthMessage kind="error">This reset link is incomplete. Request a new one.</AuthMessage>;
  }

  if (done) {
    return (
      <>
        <AuthMessage kind="success">Your password has been updated and all devices were signed out.</AuthMessage>
        <Link href="/login" className={`${authButtonClass} no-underline`}>
          Sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <AuthMessage kind="error">{error}</AuthMessage>}
      <div className="space-y-2">
        <label htmlFor="password" className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
          New Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
          minLength={8}
          maxLength={72}
          required
          autoComplete="new-password"
        />
        <p className="text-[10px] text-zinc-600">8 to 72 characters.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm" className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
          Repeat Password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={authInputClass}
          required
          autoComplete="new-password"
          aria-invalid={mismatch}
        />
        {mismatch && <p className="text-xs text-red-400">Passwords do not match.</p>}
      </div>
      <button type="submit" disabled={loading || mismatch || password.length < 8} className={authButtonClass}>
        {loading ? 'Saving...' : 'Set New Password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="New Password" subtitle="Choose a strong password">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
