"use client";

import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Landmark, PlusCircle, Repeat } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Transaction, TransactionKind } from '@/lib/api';
import { formatMoney, formatTime } from '@/lib/format';
import { asTranslate, transactionTitle } from '@/lib/transactions';

const ICONS: Record<TransactionKind, typeof ArrowRightLeft> = {
  TRANSFER: ArrowRightLeft,
  EXCHANGE: Repeat,
  TOP_UP: PlusCircle,
  DEPOSIT: Landmark,
  OTHER: ArrowRightLeft,
};

interface Props {
  transaction: Transaction;
  /** When false, the amount is masked (balance privacy toggle). */
  showAmount: boolean;
  /** Show the time of day under the title (used when rows are grouped under a day heading). */
  showTime?: boolean;
}

export function TransactionRow({ transaction: tx, showAmount, showTime = true }: Props) {
  const t = useTranslations('Transactions');
  const tDash = useTranslations('Dashboard');
  const locale = useLocale();

  const Icon = ICONS[tx.kind];
  const incoming = tx.direction === 'CREDIT';
  const title = transactionTitle(tx, asTranslate(t));
  const amount = formatMoney(tx.amount_minor, tx.currency, locale, { signDisplay: 'never' });
  const signed = `${incoming ? '+' : '−'}${amount}`;

  return (
    <li className="flex items-center gap-4 py-3.5">
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] ${
          incoming ? 'text-emerald-500' : 'text-[var(--text-muted)]'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--text-main)]">{title}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">
          {t(`kind.${tx.kind}`)}
          {showTime && <> · {formatTime(tx.date, locale)}</>}
          {' · '}
          {tDash('accountEnding', { last4: tx.account_id.slice(-4) })}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={`font-serif text-sm tabular-nums ${incoming ? 'text-emerald-500' : 'text-[var(--text-main)]'}`}
          aria-label={showAmount ? `${incoming ? t('incoming') : t('outgoing')} ${amount}` : tDash('hiddenAmount')}
        >
          {showAmount ? signed : tDash('hiddenAmount')}
        </p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
          {incoming ? <ArrowDownLeft className="h-3 w-3" aria-hidden /> : <ArrowUpRight className="h-3 w-3" aria-hidden />}
          {tx.currency}
        </p>
      </div>
    </li>
  );
}
