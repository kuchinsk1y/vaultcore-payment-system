"use client";

import { useTranslations } from 'next-intl';
import { PageShell } from '@/components/ui/PageShell';
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { useContacts } from '@/hooks/useContacts';
import { useTransferForm } from '@/hooks/useTransferForm';
import { SavedContacts } from '@/components/transfers/SavedContacts';
import { ContactSearch } from '@/components/transfers/ContactSearch';
import { TransferConfirmation } from '@/components/transfers/TransferConfirmation';

export default function TransfersPage() {
  const t = useTranslations('Transfers');
  const { accounts, loading } = useAccounts();
  const contacts = useContacts();
  const form = useTransferForm(accounts);
  const { status, errorMessage, sourceAccountId, targetAccountId, amount } = form;

  if (loading) {
    return <div className="animate-pulse h-64 bg-white/[0.02] rounded-2xl surface-premium"></div>;
  }

  return (
    <PageShell title={t('title')}>
      <div className="max-w-2xl">
      {status === 'success' ? (
        <div className="surface-premium rounded-sm p-12 text-center space-y-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-main)] mb-2">
            <CheckCircle2 className="w-6 h-6 text-[var(--text-main)]" />
          </div>
          <div>
            <h2 className="font-serif text-xl tracking-[0.1em] uppercase text-[var(--text-main)] mb-2">{t('success')}</h2>
            <p className="text-xs text-[var(--text-muted)] tracking-wide">{t('successDesc')}</p>
          </div>
          <button 
            onClick={() => form.resetStatus()}
            className="btn-luxury px-8 py-4 w-full max-w-xs text-xs tracking-[0.1em] uppercase"
          >
            New Transfer
          </button>
        </div>
      ) : form.pendingConfirmation ? (
        <TransferConfirmation
          confirmation={form.pendingConfirmation}
          code={form.confirmationCode}
          onCodeChange={form.setConfirmationCode}
          onSubmit={form.confirm}
          onCancel={form.cancelConfirmation}
          loading={status === 'loading'}
          error={errorMessage}
        />
      ) : (
        <form onSubmit={form.submit} className="surface-premium rounded-sm p-8 md:p-12 space-y-8">
          {(status === 'error' || errorMessage) && (
            <div className="p-4 border border-[var(--border-subtle)] bg-[var(--bg-main)] flex items-center text-red-900 text-xs tracking-wide">
              <AlertCircle className="w-4 h-4 mr-3 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium mb-3">{t('source')}</label>
              <select 
                value={sourceAccountId}
                onChange={(e) => form.changeSource(e.target.value)}
                className="input-premium w-full p-4 appearance-none text-sm"
                required
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-[var(--bg-main)]">
                    {acc.currency} Account (..{acc.id.slice(-4)}) — {acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {acc.currency}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center py-4">
              <div className="p-2 border border-[var(--border-subtle)] bg-[var(--bg-main)] rounded-sm">
                <ArrowRight className="w-4 h-4 text-gray-600 rotate-90 md:rotate-0" />
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium mb-3">{t('destination')} (Account ID)</label>
              <input 
                type="text"
                value={targetAccountId}
                onChange={(e) => form.setTargetAccountId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="input-premium w-full p-4 text-sm font-mono tracking-wider mb-2"
                required
              />

              <SavedContacts contacts={contacts.contacts} onSelect={form.selectContact} />

              <ContactSearch
                phone={contacts.searchPhone}
                onPhoneChange={contacts.setSearchPhone}
                onSearch={contacts.search}
                searching={contacts.searching}
                error={contacts.searchError}
                result={contacts.searchResult}
                onAdd={contacts.addFoundContact}
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium mb-3">{t('amount')}</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-600 font-serif text-lg">
                  {form.sourceAccount?.currency || ''}
                </span>
                <input 
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => form.setAmount(e.target.value)}
                  placeholder="0.00"
                  className="input-premium w-full p-4 pl-16 font-serif text-2xl bg-transparent"
                  required
                />
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit" 
              disabled={status === 'loading'}
              className="btn-gold w-full py-4 text-xs tracking-[0.1em] uppercase mt-4 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Processing' : t('send')}
            </button>
          </div>
        </form>
      )}
      </div>
    </PageShell>
  );
}
