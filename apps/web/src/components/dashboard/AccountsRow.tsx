"use client";

import { Plus, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { AccountSummary } from '@/lib/api';
import { formatMajor } from '@/lib/format';
import { SectionError, Skeleton } from '@/components/ui/SectionState';

interface Props {
  accounts: AccountSummary[] | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  visible: boolean;
  onSelect: (account: AccountSummary) => void;
  onOpenAccount: () => void;
}

export function AccountsRow({ accounts, loading, error, onRetry, visible, onSelect, onOpenAccount }: Props) {
  const t = useTranslations('Dashboard');
  const tc = useTranslations('Common');
  const locale = useLocale();

  return (
    <section aria-labelledby="accounts-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="accounts-heading" className="font-serif text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {t('yourAccounts')}
        </h2>
        {accounts && (
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            {t('accountsCount', { count: accounts.length })}
          </span>
        )}
      </div>

      {error && !accounts ? (
        <SectionError message={t('sectionError')} retryLabel={tc('retry')} onRetry={onRetry} />
      ) : (
        <ul className="hide-scrollbar flex gap-3 overflow-x-auto pb-2">
          {loading && !accounts ? (
            <>
              <li className="w-64 flex-none"><Skeleton className="h-28" /></li>
              <li className="w-64 flex-none"><Skeleton className="h-28" /></li>
            </>
          ) : (
            accounts?.map((account) => (
              <li key={account.id} className="w-64 flex-none">
                <button
                  type="button"
                  onClick={() => onSelect(account)}
                  className="surface-premium group relative h-full w-full overflow-hidden rounded-xl border border-transparent p-4 text-left transition-colors hover:border-[#D4AF37]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <Wallet className="h-5 w-5 text-[#D4AF37]" aria-hidden />
                    <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)]">
                      {t('accountEnding', { last4: account.id.slice(-4) })}
                    </span>
                  </div>
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{account.currency}</p>
                  <p className="font-serif text-2xl tabular-nums text-[var(--text-main)]">
                    {visible ? formatMajor(account.balance, account.currency, locale) : t('hiddenAmount')}
                  </p>
                </button>
              </li>
            ))
          )}

          {accounts && (
            <li className="w-56 flex-none">
              <button
                type="button"
                onClick={onOpenAccount}
                className="surface-premium flex h-full min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] p-4 transition-colors hover:border-[#D4AF37]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                <Plus className="mb-2 h-6 w-6 text-[var(--text-muted)]" aria-hidden />
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{t('openAccount')}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
