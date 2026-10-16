"use client";

import { useLocale, useTranslations } from 'next-intl';
import type { CategoryBreakdown } from '@/lib/api';
import { formatMajor } from '@/lib/format';
import { SectionError, Skeleton } from '@/components/ui/SectionState';

interface Props {
  categories: CategoryBreakdown[];
  total: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  visible: boolean;
}

export function SpendingBreakdown({ categories, total, loading, error, onRetry, visible }: Props) {
  const t = useTranslations('Dashboard');
  const tc = useTranslations('Common');
  const locale = useLocale();

  return (
    <section aria-labelledby="spending-heading" className="surface-premium flex flex-col rounded-xl p-5">
      <h2 id="spending-heading" className="mb-6 font-serif text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
        {t('spending')}
      </h2>

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : error ? (
        <SectionError message={t('sectionError')} retryLabel={tc('retry')} onRetry={onRetry} />
      ) : categories.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-[var(--text-muted)]">{t('noSpending')}</p>
      ) : (
        <ul className="space-y-5 overflow-y-auto pr-1">
          {categories.map((entry) => {
            const share = total > 0 ? (entry.amount / total) * 100 : 0;
            return (
              <li key={entry.category} className="space-y-2">
                <div className="flex items-end justify-between gap-3">
                  <span className="text-sm text-[var(--text-main)]">{entry.category}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {visible ? formatMajor(entry.amount, 'EUR', locale) : t('hiddenAmount')}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]" role="presentation">
                  <div className="h-full rounded-full bg-[#D4AF37]/80" style={{ width: `${Math.min(100, Math.max(2, share))}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
