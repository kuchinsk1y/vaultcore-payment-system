"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Transaction } from '@/lib/api';
import { SectionError, Skeleton } from '@/components/ui/SectionState';
import { TransactionList } from '@/components/transactions/TransactionList';

interface Props {
  transactions: Transaction[] | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  visible: boolean;
}

export function RecentTransactions({ transactions, loading, error, onRetry, visible }: Props) {
  const t = useTranslations('Dashboard');
  const tc = useTranslations('Common');

  return (
    <section aria-labelledby="recent-heading" className="surface-premium rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="recent-heading" className="font-serif text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {t('recentTitle')}
        </h2>
        <Link href="/transactions" className="text-xs uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C048]">
          {t('viewAll')}
        </Link>
      </div>

      {loading && !transactions ? (
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : error && !transactions ? (
        <SectionError message={t('sectionError')} retryLabel={tc('retry')} onRetry={onRetry} />
      ) : transactions && transactions.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">{t('noTransactions')}</p>
      ) : (
        <TransactionList transactions={transactions ?? []} showAmounts={visible} />
      )}
    </section>
  );
}
