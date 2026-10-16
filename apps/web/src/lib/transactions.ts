import type { Transaction } from './api';
import { dayBucket, dayKey, type DayBucket } from './format';

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** next-intl's `t` is typed by literal message keys; this widens it for key-driven helpers. */
export const asTranslate = (t: unknown): Translate => t as Translate;

/** Human title for a ledger movement, e.g. "Transfer to Ada Lovelace". */
export function transactionTitle(tx: Transaction, t: Translate): string {
  switch (tx.kind) {
    case 'TRANSFER': {
      const counterparty = tx.counterparty;
      if (!counterparty || counterparty.is_self) return t('transferGeneric');
      return tx.direction === 'DEBIT'
        ? t('transferTo', { name: counterparty.name })
        : t('transferFrom', { name: counterparty.name });
    }
    case 'EXCHANGE':
      return t('exchange');
    case 'TOP_UP':
      return t('topUp');
    case 'DEPOSIT':
      return t('deposit');
    default:
      return tx.description || t('other');
  }
}

export interface DayGroup {
  key: string;
  bucket: DayBucket;
  /** ISO timestamp of the first item, used to format the heading for older days. */
  iso: string;
  items: Transaction[];
}

/** Groups transactions (already sorted newest first) by the viewer's local calendar day. */
export function groupByDay(items: Transaction[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKey(item.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, bucket: dayBucket(item.date, now), iso: item.date, items: [item] });
    }
  }
  return groups;
}
