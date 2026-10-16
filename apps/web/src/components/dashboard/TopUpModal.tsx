"use client";

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ApiException, topUpAccount, type AccountOptions, type AccountSummary } from '@/lib/api';
import { formatMoney, parseAmountToMinor } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  accounts: AccountSummary[];
  options: AccountOptions | null;
  /** Account preselected when the modal opens. */
  initialAccountId?: string;
  onClose: () => void;
  onDone: () => void;
}

const QUICK_AMOUNTS = [50, 100, 500, 1000];

export function TopUpModal(props: Props) {
  // Remount on every open so the form always starts clean
  return props.open ? <TopUpForm key="open" {...props} /> : null;
}

function TopUpForm({ accounts, options, initialAccountId, onClose, onDone }: Props) {
  const t = useTranslations('TopUp');
  const tc = useTranslations('Common');
  const locale = useLocale();

  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? 'EUR';
  const minor = parseAmountToMinor(amount);
  const perRequest = options?.top_up.max_per_request;
  const overLimit = minor !== null && perRequest !== undefined && minor > perRequest;
  const disabled = options !== null && !options.top_up.enabled;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (minor === null || overLimit || !account) return;

    setBusy(true);
    setError('');
    try {
      const result = await topUpAccount(account.id, minor);
      setAdded(formatMoney(result.amount_minor, result.currency, locale));
      onDone();
    } catch (err) {
      if (err instanceof ApiException && err.code === 'TOPUP_DISABLED') setError(t('disabled'));
      else if (err instanceof ApiException && err.code === 'LIMIT_EXCEEDED') setError(t('dailyLimit'));
      else setError(err instanceof ApiException ? err.message : t('invalidAmount'));
    } finally {
      setBusy(false);
    }
  };

  const limits =
    options &&
    t('limits', {
      perRequest: formatMoney(options.top_up.max_per_request, currency, locale),
      daily: formatMoney(options.top_up.max_per_24h, currency, locale),
    });

  return (
    <Modal open title={t('title')} description={t('desc')} closeLabel={tc('close')} onClose={onClose}>
      {added ? (
        <div className="space-y-6">
          <p role="status" className="text-sm text-emerald-500">{t('success', { amount: added })}</p>
          <button type="button" onClick={onClose} className="btn-gold w-full py-3 text-xs tracking-[0.1em] uppercase">
            {tc('close')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {disabled && <p role="alert" className="text-sm text-amber-500">{t('disabled')}</p>}

          <div className="space-y-2">
            <label htmlFor="topup-account" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {t('account')}
            </label>
            <select
              id="topup-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input-premium w-full rounded-lg p-3 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.currency} · …{a.id.slice(-4)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="topup-amount" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {t('amount')} ({currency})
            </label>
            <input
              id="topup-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-invalid={amount !== '' && (minor === null || overLimit)}
              aria-describedby="topup-hint"
              className="input-premium w-full rounded-lg p-3 font-serif text-2xl tabular-nums"
            />
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={t('quick')}>
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[#D4AF37]/50 hover:text-[var(--text-main)]"
                >
                  {formatMoney(value * 100, currency, locale).replace(/[.,]00$/, '')}
                </button>
              ))}
            </div>
            <p id="topup-hint" className="text-xs text-[var(--text-muted)]">
              {amount !== '' && minor === null ? <span className="text-red-500">{t('invalidAmount')}</span> : overLimit ? <span className="text-red-500">{t('overLimit')}</span> : limits}
            </p>
          </div>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-4 pt-2">
            <button type="button" onClick={onClose} className="text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]">
              {tc('cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || minor === null || overLimit || disabled || !account}
              className="btn-gold px-6 py-3 text-xs tracking-[0.1em] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('submitting') : t('submit')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
