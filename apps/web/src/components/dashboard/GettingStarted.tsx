"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Circle } from 'lucide-react';
import { resendVerificationEmail } from '@/lib/api';
import type { OnboardingStep, OnboardingStepId } from '@/lib/onboarding';

interface Props {
  steps: OnboardingStep[];
  done: number;
  onTopUp: () => void;
}

const LINKS: Partial<Record<OnboardingStepId, string>> = {
  transfer: '/transfers',
  card: '/cards',
  twoFactor: '/settings',
};

const ctaClass = 'shrink-0 text-xs uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C048] focus:outline-none focus-visible:underline';

/** Checklist for new users; the dashboard hides it once every step is done. */
export function GettingStarted({ steps, done, onTopUp }: Props) {
  const t = useTranslations('GettingStarted');
  const [emailSent, setEmailSent] = useState(false);

  const resend = async () => {
    try {
      await resendVerificationEmail();
      setEmailSent(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <section aria-labelledby="getting-started-heading" className="surface-premium rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="getting-started-heading" className="font-serif text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {t('title')}
        </h2>
        <span className="text-xs text-[var(--text-muted)]">{t('progress', { done, total: steps.length })}</span>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <div className="h-full rounded-full bg-[#D4AF37] transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-4 py-3">
            {step.done ? (
              <Check className="h-5 w-5 shrink-0 text-emerald-500" aria-label={t('done')} />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
            )}

            <div className="min-w-0 flex-1">
              <p className={`text-sm ${step.done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-main)]'}`}>{t(`${step.id}.title`)}</p>
              {!step.done && <p className="text-xs text-[var(--text-muted)]">{t(`${step.id}.desc`)}</p>}
            </div>

            {!step.done &&
              (step.id === 'verifyEmail' ? (
                <button type="button" onClick={resend} disabled={emailSent} className={`${ctaClass} disabled:opacity-60`}>
                  {emailSent ? t('emailSent') : t(`${step.id}.cta`)}
                </button>
              ) : step.id === 'topUp' ? (
                <button type="button" onClick={onTopUp} className={ctaClass}>
                  {t(`${step.id}.cta`)}
                </button>
              ) : (
                <Link href={LINKS[step.id] ?? '/dashboard'} className={ctaClass}>
                  {t(`${step.id}.cta`)}
                </Link>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
