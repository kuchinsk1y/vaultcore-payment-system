"use client";

import { useTranslations } from 'next-intl';
import { Download, Search } from 'lucide-react';
import { PageShell } from '@/components/ui/PageShell';
import { SectionError, Skeleton } from '@/components/ui/SectionState';
import { TransactionList } from '@/components/transactions/TransactionList';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions, type FilterState } from '@/hooks/useTransactions';
import { transactionsExportUrl, type TransactionKind } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

const KINDS: TransactionKind[] = ['TRANSFER', 'EXCHANGE', 'TOP_UP', 'DEPOSIT'];

const controlClass = 'input-premium w-full rounded-lg p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]';
const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]';

export default function TransactionsPage() {
  const t = useTranslations('Transactions');
  const tc = useTranslations('Common');
  const visible = useAppStore((state) => state.isBalanceVisible);

  const { accounts } = useAccounts();
  const tx = useTransactions();
  const { filters } = tx;

  return (
    <PageShell
      title={t('title')}
      subtitle={t('subtitle')}
      actions={
        <a
          href={transactionsExportUrl(tx.apiFilters)}
          download
          className="btn-luxury inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs uppercase tracking-widest"
        >
          <Download className="h-4 w-4" aria-hidden />
          {t('export')}
        </a>
      }
    >

      <form role="search" onSubmit={(e) => e.preventDefault()} className="surface-premium grid grid-cols-2 gap-3 rounded-xl p-4 md:grid-cols-6">
        <div className="relative col-span-2 md:col-span-6">
          <label htmlFor="tx-search" className="sr-only">{t('searchLabel')}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
          <input
            id="tx-search"
            type="search"
            value={filters.q}
            onChange={(e) => tx.update({ q: e.target.value })}
            placeholder={t('searchPlaceholder')}
            maxLength={100}
            className={`${controlClass} pl-10`}
          />
        </div>

        <div className="col-span-2 md:col-span-2">
          <label htmlFor="tx-account" className={labelClass}>{t('allAccounts')}</label>
          <select id="tx-account" value={filters.account_id} onChange={(e) => tx.update({ account_id: e.target.value })} className={controlClass}>
            <option value="">{t('allAccounts')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.currency} · …{a.id.slice(-4)}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          <label htmlFor="tx-kind" className={labelClass}>{t('allTypes')}</label>
          <select id="tx-kind" value={filters.kind} onChange={(e) => tx.update({ kind: e.target.value as FilterState['kind'] })} className={controlClass}>
            <option value="">{t('allTypes')}</option>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          <label htmlFor="tx-direction" className={labelClass}>{t('allDirections')}</label>
          <select id="tx-direction" value={filters.direction} onChange={(e) => tx.update({ direction: e.target.value as FilterState['direction'] })} className={controlClass}>
            <option value="">{t('allDirections')}</option>
            <option value="CREDIT">{t('incoming')}</option>
            <option value="DEBIT">{t('outgoing')}</option>
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          <label htmlFor="tx-from" className={labelClass}>{t('from')}</label>
          <input id="tx-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => tx.update({ from: e.target.value })} className={controlClass} />
        </div>

        <div className="col-span-1 md:col-span-2">
          <label htmlFor="tx-to" className={labelClass}>{t('to')}</label>
          <input id="tx-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => tx.update({ to: e.target.value })} className={controlClass} />
        </div>

        <div className="col-span-2 flex items-end md:col-span-2">
          {tx.hasFilters && (
            <button type="button" onClick={tx.clear} className="text-xs uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C048]">
              {t('clear')}
            </button>
          )}
        </div>
      </form>

      <section aria-live="polite" aria-busy={tx.loading} className="surface-premium rounded-xl p-5">
        {tx.loading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : tx.error && tx.items.length === 0 ? (
          <SectionError message={t('error')} retryLabel={tc('retry')} onRetry={tx.retry} />
        ) : tx.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">{tx.hasFilters ? t('empty') : t('emptyNone')}</p>
        ) : (
          <>
            <TransactionList transactions={tx.items} showAmounts={visible} />
            {tx.error && <p role="alert" className="mt-4 text-sm text-red-500">{t('error')}</p>}
            {tx.hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={tx.loadMore}
                  disabled={tx.loadingMore}
                  className="btn-luxury rounded-md px-6 py-2.5 text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {tx.loadingMore ? tc('loading') : t('loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
