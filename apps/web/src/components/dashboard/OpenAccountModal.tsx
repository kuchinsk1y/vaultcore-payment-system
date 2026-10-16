"use client";

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiException, createAccount, fetchAccountOptions } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  /** Currencies the user already has an active account in. */
  heldCurrencies: string[];
  onClose: () => void;
  onDone: () => void;
}

export function OpenAccountModal(props: Props) {
  return props.open ? <OpenAccountForm key="open" {...props} /> : null;
}

function OpenAccountForm({ heldCurrencies, onClose, onDone }: Props) {
  const t = useTranslations('OpenAccount');
  const tc = useTranslations('Common');

  const [available, setAvailable] = useState<string[] | null>(null);
  const [currency, setCurrency] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openedCurrency, setOpenedCurrency] = useState<string | null>(null);

  // The supported currencies come from the server rather than being hard-coded in the UI
  useEffect(() => {
    let cancelled = false;
    fetchAccountOptions()
      .then((options) => {
        if (cancelled) return;
        const free = options.currencies.filter((c) => !heldCurrencies.includes(c));
        setAvailable(free);
        setCurrency(free[0] ?? '');
      })
      .catch((err) => !cancelled && setError(err instanceof ApiException ? err.message : t('none')));
    return () => {
      cancelled = true;
    };
  }, [heldCurrencies, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currency) return;
    setBusy(true);
    setError('');
    try {
      await createAccount(currency);
      setOpenedCurrency(currency);
      onDone();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('none'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={t('title')} description={t('desc')} closeLabel={tc('close')} onClose={onClose}>
      {openedCurrency ? (
        <div className="space-y-6">
          <p role="status" className="text-sm text-emerald-500">{t('success', { currency: openedCurrency })}</p>
          <button type="button" onClick={onClose} className="btn-gold w-full py-3 text-xs tracking-[0.1em] uppercase">
            {tc('close')}
          </button>
        </div>
      ) : available === null && !error ? (
        <p className="text-sm text-[var(--text-muted)]">{tc('loading')}</p>
      ) : available !== null && available.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t('none')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="open-currency" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {t('currency')}
            </label>
            <select
              id="open-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input-premium w-full rounded-lg p-3 text-sm"
            >
              {(available ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-4 pt-2">
            <button type="button" onClick={onClose} className="text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]">
              {tc('cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || !currency}
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
