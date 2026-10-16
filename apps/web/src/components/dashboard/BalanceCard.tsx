"use client";

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, CreditCard, PlusCircle, Repeat } from 'lucide-react';
import { formatMajor, formatPercent } from '@/lib/format';
import type { BalanceChange } from '@/lib/portfolio';
import { SectionError, Skeleton } from '@/components/ui/SectionState';

interface Props {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Total across all accounts, in EUR major units. */
  total: number;
  change: BalanceChange | null;
  visible: boolean;
  onTopUp: () => void;
}

const actionClass =
  'group flex items-center gap-2 rounded-md border border-[var(--border-subtle)] px-5 py-3 text-[var(--text-main)] transition-colors hover:border-[#D4AF37]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]';

export function BalanceCard({ loading, error, onRetry, total, change, visible, onTopUp }: Props) {
  const t = useTranslations('Dashboard');
  const tn = useTranslations('Navigation');
  const tc = useTranslations('Common');
  const locale = useLocale();

  const up = (change?.absolute ?? 0) >= 0;
  const TrendIcon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <section aria-labelledby="balance-heading" className="surface-premium flex flex-col justify-between gap-8 rounded-xl p-6 lg:col-span-2">
      <div className="space-y-3">
        <h2 id="balance-heading" className="font-serif text-lg text-[var(--text-muted)]">
          {t('totalBalance')}
        </h2>

        {loading ? (
          <Skeleton className="h-12 w-64" />
        ) : error ? (
          <SectionError message={t('sectionError')} retryLabel={tc('retry')} onRetry={onRetry} />
        ) : (
          <>
            <p className="font-serif text-5xl tracking-tight text-[var(--text-main)] tabular-nums">
              {visible ? formatMajor(total, 'EUR', locale) : t('hiddenAmount')}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {change && visible && (
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs tabular-nums ${
                    up ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                  }`}
                >
                  <TrendIcon className="h-3 w-3" aria-hidden />
                  {formatMajor(change.absolute, 'EUR', locale, { signDisplay: 'exceptZero' })}
                  {change.fraction !== null && <> ({formatPercent(change.fraction, locale)})</>}
                </span>
              )}
              {change && visible && <span className="text-xs text-[var(--text-muted)]">{t('change30d')}</span>}
              {!change && <span className="text-xs text-[var(--text-muted)]">{t('balanceNote')}</span>}
            </div>
          </>
        )}
      </div>

      <nav aria-label={t('quickActions')} className="flex flex-wrap gap-3">
        <Link href="/transfers" className={actionClass}>
          <ArrowRightLeft className="h-4 w-4 text-[#D4AF37]" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-widest">{tn('transfers')}</span>
        </Link>
        <button type="button" onClick={onTopUp} className={actionClass}>
          <PlusCircle className="h-4 w-4 text-[#D4AF37]" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-widest">{t('topUp')}</span>
        </button>
        <Link href="/exchange" className={actionClass}>
          <Repeat className="h-4 w-4 text-[#D4AF37]" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-widest">{t('exchange')}</span>
        </Link>
        <Link href="/cards" className={actionClass}>
          <CreditCard className="h-4 w-4 text-[#D4AF37]" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-widest">{t('cards')}</span>
        </Link>
      </nav>
    </section>
  );
}
