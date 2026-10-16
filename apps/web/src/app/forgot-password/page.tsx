'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, ApiException } from '@/lib/api';
import { AuthMessage, AuthShell, authButtonClass, authInputClass } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset Password"
      subtitle="We will email you a secure link"
      footer={
        <Link href="/login" className="text-[#C5A059] hover:text-[#E5C048]">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <AuthMessage kind="success">
          If an account exists for {email}, a reset link is on its way. The link is valid for one hour.
        </AuthMessage>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <AuthMessage kind="error">{error}</AuthMessage>}
          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClass}
              required
              autoComplete="email"
            />
          </div>
          <button type="submit" disabled={loading || !email} className={authButtonClass}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
