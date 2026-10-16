"use client";

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown } from 'lucide-react';
import { OpenAccountModal } from '@/components/dashboard/OpenAccountModal';
import { PageShell } from '@/components/ui/PageShell';
import { Skeleton } from '@/components/ui/SectionState';
import { useAccounts } from '@/hooks/useAccounts';
import { useAsync } from '@/hooks/useAsync';
import { ApiException, convertFx, fetchFxRates } from '@/lib/api';
import { quote } from '@/lib/exchange';
import { formatMajor, formatMoney, parseAmountToMinor } from '@/lib/format';

const controlClass = 'input-premium w-full rounded-lg p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]';
const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]';

export default function ExchangePage() {
  const t = useTranslations('Exchange');
  const tc = useTranslations('Common');
  const locale = useLocale();

  const { accounts, loading, reload } = useAccounts();
  const rates = useAsync(fetchFxRates);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openAccount, setOpenAccount] = useState(false);

  // Defaults derive from the data, so they are never out of sync with it
  const source = accounts.find((a) => a.id === fromId) ?? accounts[0];
  const targets = accounts.filter((a) => a.currency !== source?.currency);
  const target = targets.find((a) => a.id === toId) ?? targets[0];

  const minor = parseAmountToMinor(amount);
  const preview = source && target && minor !== null && rates.data ? quote(rates.data, source.currency, target.currency, minor) : null;
  const availableMinor = source ? Math.round(source.balance * 100) : 0;
  const tooMuch = minor !== null && minor > availableMinor;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !target || minor === null || tooMuch) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await convertFx({ source_account_id: source.id, destination_account_id: target.id, amount: minor });
      setSuccess(
        t('success', {
          from: formatMoney(result.source_amount, result.source_currency, locale),
          to: formatMoney(result.converted_amount, result.destination_currency, locale),
        }),
      );
      setAmount('');
      reload();
    } catch (err) {
      const code = err instanceof ApiException ? err.message : '';
      setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.default'));
    } finally {
      setBusy(false);
    }
  };

  const canExchange = accounts.length > 0 && targets.length > 0;

  return (
    <PageShell title={t('title')} subtitle={t('subtitle')}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {loading ? (
        <Skeleton className="h-72 lg:col-span-2" />
      ) : !canExchange ? (
        <section className="surface-premium space-y-4 rounded-xl p-6 text-center lg:col-span-2">
          <p className="text-sm text-[var(--text-muted)]">{t('needTwo')}</p>
          <button type="button" onClick={() => setOpenAccount(true)} className="btn-gold px-6 py-3 text-xs tracking-[0.1em] uppercase">
            {t('openAccount')}
          </button>
        </section>
      ) : (
        <form onSubmit={submit} noValidate className="surface-premium space-y-5 rounded-xl p-6 lg:col-span-2">
          <div>
            <label htmlFor="fx-from" className={labelClass}>{t('from')}</label>
            <select id="fx-from" value={source?.id} onChange={(e) => { setFromId(e.target.value); setToId(''); }} className={controlClass}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.currency} · …{a.id.slice(-4)}
                </option>
              ))}
            </select>
            {source && (
              <p className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
                {t('available', { amount: formatMajor(source.balance, source.currency, locale) })}
              </p>
            )}
          </div>

          <div className="flex justify-center text-[var(--text-muted)]">
            <ArrowDown className="h-4 w-4" aria-hidden />
          </div>

          <div>
            <label htmlFor="fx-to" className={labelClass}>{t('to')}</label>
            <select id="fx-to" value={target?.id} onChange={(e) => setToId(e.target.value)} className={controlClass}>
              {targets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.currency} · …{a.id.slice(-4)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fx-amount" className={labelClass}>
              {t('amount')} ({source?.currency})
            </label>
            <input
              id="fx-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-invalid={amount !== '' && (minor === null || tooMuch)}
              className="input-premium w-full rounded-lg p-3 font-serif text-2xl tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            />
            {tooMuch && <p className="mt-1 text-xs text-red-500">{t('errors.INSUFFICIENT_FUNDS')}</p>}
          </div>

          <dl className="space-y-2 rounded-lg border border-[var(--border-subtle)] p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">{t('rate')}</dt>
              <dd className="tabular-nums text-[var(--text-main)]">
                {source && target ? (preview ? `1 ${source.currency} = ${preview.rate} ${target.currency}` : '—') : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">{t('youGet')}</dt>
              <dd className="font-serif text-lg tabular-nums text-[var(--text-main)]">
                {preview && target ? formatMoney(preview.convertedMinor, target.currency, locale) : '—'}
              </dd>
            </div>
          </dl>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          {success && <p role="status" className="text-sm text-emerald-500">{success}</p>}

          <button
            type="submit"
            disabled={busy || minor === null || tooMuch || !preview}
            className="btn-gold w-full py-4 text-xs tracking-[0.1em] uppercase disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t('submitting') : t('submit')}
          </button>
        </form>
      )}

      <section aria-labelledby="rates-heading" className="surface-premium h-fit rounded-xl p-6">
        <h2 id="rates-heading" className="font-serif text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {t('rates')}
        </h2>
        <p className="mb-4 mt-1 text-xs text-[var(--text-muted)]">{t('ratesNote')}</p>

        {rates.loading && !rates.data ? (
          <Skeleton className="h-24" />
        ) : rates.error && !rates.data ? (
          <button type="button" onClick={rates.reload} className="text-xs uppercase tracking-widest text-[#D4AF37]">
            {tc('retry')}
          </button>
        ) : (
          <ul>
            {[...(rates.data ?? [])]
              .sort((a, b) => `${a.base_currency}${a.target_currency}`.localeCompare(`${b.base_currency}${b.target_currency}`))
              .map((rate) => (
                <li key={rate.id} className="flex justify-between border-b border-[var(--border-subtle)] py-2 text-sm">
                  <span className="text-[var(--text-muted)]">
                    {rate.base_currency} → {rate.target_currency}
                  </span>
                  <span className="tabular-nums text-[var(--text-main)]">{Number(rate.rate)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
      </div>

      <OpenAccountModal open={openAccount} heldCurrencies={accounts.map((a) => a.currency)} onClose={() => setOpenAccount(false)} onDone={reload} />
    </PageShell>
  );
}
