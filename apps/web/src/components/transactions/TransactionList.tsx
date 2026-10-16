"use client";

import { useLocale, useTranslations } from 'next-intl';
import type { Transaction } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { groupByDay } from '@/lib/transactions';
import { TransactionRow } from './TransactionRow';

interface Props {
  transactions: Transaction[];
  showAmounts: boolean;
}

/** Transactions grouped under "Today" / "Yesterday" / date headings. */
export function TransactionList({ transactions, showAmounts }: Props) {
  const t = useTranslations('Transactions');
  const locale = useLocale();

  return (
    <div className="space-y-6">
      {groupByDay(transactions).map((group) => (
        <section key={group.key} aria-label={group.key}>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {group.bucket === 'today' ? t('today') : group.bucket === 'yesterday' ? t('yesterday') : formatDate(group.iso, locale)}
          </h3>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {group.items.map((tx) => (
              <TransactionRow key={tx.id} transaction={tx} showAmount={showAmounts} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
