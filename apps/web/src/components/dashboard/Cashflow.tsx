"use client";

import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatMajor } from '@/lib/format';
import { SectionError, Skeleton } from '@/components/ui/SectionState';

interface Props {
  income: number;
  expenses: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  visible: boolean;
}

/** Income and expenses for the current month, in EUR (the API normalises all currencies). */
export function Cashflow({ income, expenses, loading, error, onRetry, visible }: Props) {
  const t = useTranslations('Dashboard');
  const tc = useTranslations('Common');
  const locale = useLocale();

  if (error) return <SectionError message={t('sectionError')} retryLabel={tc('retry')} onRetry={onRetry} />;

  const rows = [
    { label: t('income'), value: income, Icon: ArrowUpRight, tone: 'text-emerald-500' },
    { label: t('expenses'), value: expenses, Icon: ArrowDownRight, tone: 'text-rose-500' },
  ];

  return (
    <section aria-label={t('thisMonth')} className="flex flex-col gap-4">
      {rows.map(({ label, value, Icon, tone }) => (
        <div key={label} className="surface-premium flex flex-1 flex-col justify-center rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-base text-[var(--text-muted)]">
              {label} <span className="text-xs">· {t('thisMonth')}</span>
            </h2>
            <Icon className={`h-4 w-4 ${tone}`} aria-hidden />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <p className="font-serif text-2xl tabular-nums text-[var(--text-main)]">
              {visible ? formatMajor(value, 'EUR', locale) : t('hiddenAmount')}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
