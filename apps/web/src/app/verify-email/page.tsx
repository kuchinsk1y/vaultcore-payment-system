'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { verifyEmail, ApiException } from '@/lib/api';
import { AuthMessage, AuthShell, authButtonClass } from '@/components/auth/AuthShell';

type State = { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; message: string };

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(
    token ? { kind: 'loading' } : { kind: 'error', message: 'This verification link is incomplete.' },
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => !cancelled && setState({ kind: 'ok' }))
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: 'error', message: err instanceof ApiException ? err.message : 'Verification failed.' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === 'loading') return <p className="text-sm text-zinc-400 text-center">Verifying your email...</p>;

  return (
    <>
      {state.kind === 'ok' ? (
        <AuthMessage kind="success">Your email address is confirmed. You can now make transfers.</AuthMessage>
      ) : (
        <AuthMessage kind="error">{state.message} Sign in and request a new link from the banner on your dashboard.</AuthMessage>
      )}
      <Link href="/dashboard" className={`${authButtonClass} no-underline`}>
        Continue
      </Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Email Verification">
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthShell>
  );
}
