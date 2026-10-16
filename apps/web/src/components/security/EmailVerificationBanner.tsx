"use client";

import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { ApiException, resendVerificationEmail } from '@/lib/api';

/** Shown to users who have not confirmed their email yet; transfers stay disabled until they do. */
export function EmailVerificationBanner() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const resend = async () => {
    setState('sending');
    try {
      await resendVerificationEmail();
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not send the email.');
      setState('error');
    }
  };

  return (
    <div
      role="status"
      className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4"
    >
      <div className="flex items-start gap-3 text-sm text-[var(--text-main)]">
        <MailWarning className="w-5 h-5 shrink-0 text-[#D4AF37]" aria-hidden />
        <p>
          Confirm your email address to enable transfers. We sent you a link when you registered.
          {state === 'error' && <span className="block text-red-500 mt-1">{error}</span>}
        </p>
      </div>
      <button
        onClick={resend}
        disabled={state === 'sending' || state === 'sent'}
        className="shrink-0 text-xs uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C048] disabled:opacity-60"
      >
        {state === 'sent' ? 'Email sent' : state === 'sending' ? 'Sending...' : 'Resend email'}
      </button>
    </div>
  );
}
