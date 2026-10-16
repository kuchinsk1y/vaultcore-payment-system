import { describe, expect, it } from 'vitest';
import type { FxRate, PortfolioItem, Transaction } from './api';
import { quote } from './exchange';
import { dayBucket, dayKey, formatMajor, formatMoney, formatPercent, parseAmountToMinor } from './format';
import { computeOnboarding } from './onboarding';
import { computeChange, isEmptySeries } from './portfolio';
import { groupByDay, transactionTitle, type Translate } from './transactions';

describe('formatMoney / formatMajor', () => {
  it('formats minor units for the locale', () => {
    expect(formatMoney(123456, 'EUR', 'en')).toBe('€1,234.56');
    expect(formatMoney(123456, 'EUR', 'de').replace(/\s/g, ' ')).toBe('1.234,56 €');
    expect(formatMoney(5, 'USD', 'en')).toBe('$0.05');
  });

  it('formats major units and honours the sign option', () => {
    expect(formatMajor(12.5, 'PLN', 'en')).toContain('12.50');
    expect(formatMajor(3, 'EUR', 'en', { signDisplay: 'always' })).toBe('+€3.00');
    expect(formatMajor(0, 'EUR', 'en', { signDisplay: 'exceptZero' })).toBe('€0.00');
  });

  it('formats percentages with an explicit sign', () => {
    expect(formatPercent(0.0234, 'en')).toBe('+2.3%');
    expect(formatPercent(-0.1, 'en')).toBe('-10.0%');
    expect(formatPercent(0, 'en')).toBe('0.0%');
  });
});

describe('parseAmountToMinor', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    [' 1 200.00 ', 120000],
    ['0.01', 1],
    ['0.1', 10],
  ])('parses %j as %i', (input, expected) => {
    expect(parseAmountToMinor(input)).toBe(expected);
  });

  it.each(['', 'abc', '0', '0.00', '-5', '1.234', '1e3', '12.', '.5', '1,2,3', '9'.repeat(20)])('rejects %j', (input) => {
    expect(parseAmountToMinor(input)).toBeNull();
  });

  it('avoids floating point drift', () => {
    expect(parseAmountToMinor('0.29')).toBe(29);
    expect(parseAmountToMinor('1.15')).toBe(115);
  });
});

describe('dayBucket / dayKey', () => {
  const now = new Date(2026, 2, 15, 10, 0, 0);

  it('buckets by local calendar day, not by 24-hour distance', () => {
    expect(dayBucket(new Date(2026, 2, 15, 0, 5).toISOString(), now)).toBe('today');
    expect(dayBucket(new Date(2026, 2, 14, 23, 55).toISOString(), now)).toBe('yesterday');
    expect(dayBucket(new Date(2026, 2, 13, 12, 0).toISOString(), now)).toBe('other');
  });

  it('builds a stable local key', () => {
    expect(dayKey(new Date(2026, 0, 5, 12).toISOString())).toBe('2026-01-05');
  });
});

describe('computeChange / isEmptySeries', () => {
  const series = (...balances: number[]): PortfolioItem[] => balances.map((balance, i) => ({ date: `d${i}`, balance }));

  it('reports absolute and relative change', () => {
    expect(computeChange(series(100, 120, 150))).toEqual({ absolute: 50, fraction: 0.5 });
    expect(computeChange(series(200, 150))).toEqual({ absolute: -50, fraction: -0.25 });
  });

  it('has no relative figure when the balance started at zero', () => {
    expect(computeChange(series(0, 100))).toEqual({ absolute: 100, fraction: null });
  });

  it('reports no change for a flat or too-short series', () => {
    expect(computeChange(series(80, 90, 80))).toEqual({ absolute: 0, fraction: 0 });
    expect(computeChange(series(0, 0))).toEqual({ absolute: 0, fraction: null });
    expect(computeChange(series(10))).toBeNull();
    expect(computeChange([])).toBeNull();
  });

  it('detects an all-zero series', () => {
    expect(isEmptySeries(series(0, 0, 0))).toBe(true);
    expect(isEmptySeries(series(0, 1))).toBe(false);
  });
});

describe('computeOnboarding', () => {
  const base = {
    profile: { email_verified: false, two_factor_enabled: false },
    accounts: [{ balance: 0 }],
    hasSentTransfer: false,
    hasTransactions: false,
    cards: [],
  };

  it('starts with nothing done', () => {
    const result = computeOnboarding(base);
    expect(result.done).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.ready).toBe(true);
  });

  it('marks each step from real data', () => {
    const result = computeOnboarding({
      profile: { email_verified: true, two_factor_enabled: true },
      accounts: [{ balance: 25 }],
      hasSentTransfer: true,
      hasTransactions: true,
      cards: [{ id: 'c1' }],
    });
    expect(result.steps.every((s) => s.done)).toBe(true);
    expect(result.complete).toBe(true);
  });

  it('counts an account that already has history as funded even at zero balance', () => {
    const result = computeOnboarding({ ...base, hasTransactions: true });
    expect(result.steps.find((s) => s.id === 'topUp')?.done).toBe(true);
  });

  it('is not ready (and claims nothing) while data is loading', () => {
    const result = computeOnboarding({ profile: null, accounts: null, hasSentTransfer: null, hasTransactions: null, cards: null });
    expect(result.ready).toBe(false);
    expect(result.done).toBe(0);
  });
});

describe('quote', () => {
  const rates: FxRate[] = [
    { id: '1', base_currency: 'EUR', target_currency: 'USD', rate: '1.085000', created_at: '' },
    { id: '2', base_currency: 'USD', target_currency: 'EUR', rate: '0.921600', created_at: '' },
  ];

  it('truncates like the API does', () => {
    // 100.00 EUR * 1.085 = 108.50 USD
    expect(quote(rates, 'EUR', 'USD', 10000)).toEqual({ rate: 1.085, convertedMinor: 10850 });
    // 0.99 EUR * 1.085 = 1.07415 -> 107 cents (floored, never rounded up)
    expect(quote(rates, 'EUR', 'USD', 99)?.convertedMinor).toBe(107);
  });

  it('returns null when there is no usable rate or the currencies match', () => {
    expect(quote(rates, 'EUR', 'PLN', 100)).toBeNull();
    expect(quote(rates, 'EUR', 'EUR', 100)).toBeNull();
    expect(quote([{ ...rates[0], rate: '0' }], 'EUR', 'USD', 100)).toBeNull();
  });
});

describe('transactionTitle', () => {
  // A tiny stand-in for next-intl's translator
  const t: Translate = (key, values) => (values ? `${key}:${Object.values(values).join(',')}` : key);
  const tx = (over: Partial<Transaction>): Transaction => ({
    id: 'e1',
    transaction_id: 't1',
    date: '2026-03-15T10:00:00Z',
    kind: 'TRANSFER',
    direction: 'DEBIT',
    amount_minor: 100,
    currency: 'EUR',
    description: null,
    account_id: 'a1',
    counterparty: { name: 'Ada', account_id: 'a2', is_self: false },
    ...over,
  });

  it('names the other party for transfers, by direction', () => {
    expect(transactionTitle(tx({}), t)).toBe('transferTo:Ada');
    expect(transactionTitle(tx({ direction: 'CREDIT' }), t)).toBe('transferFrom:Ada');
  });

  it('falls back to a generic title for own-account or unknown counterparties', () => {
    expect(transactionTitle(tx({ counterparty: { name: 'Me', account_id: 'a3', is_self: true } }), t)).toBe('transferGeneric');
    expect(transactionTitle(tx({ counterparty: null }), t)).toBe('transferGeneric');
  });

  it('labels the other kinds', () => {
    expect(transactionTitle(tx({ kind: 'EXCHANGE' }), t)).toBe('exchange');
    expect(transactionTitle(tx({ kind: 'TOP_UP' }), t)).toBe('topUp');
    expect(transactionTitle(tx({ kind: 'DEPOSIT' }), t)).toBe('deposit');
    expect(transactionTitle(tx({ kind: 'OTHER', description: 'Refund' }), t)).toBe('Refund');
    expect(transactionTitle(tx({ kind: 'OTHER' }), t)).toBe('other');
  });

  it('groups consecutive transactions by local day', () => {
    const now = new Date(2026, 2, 15, 12);
    const at = (d: number, h: number, id: string) => tx({ id, date: new Date(2026, 2, d, h).toISOString() });
    const groups = groupByDay([at(15, 11, 'a'), at(15, 9, 'b'), at(14, 20, 'c'), at(10, 8, 'd')], now);

    expect(groups.map((g) => [g.bucket, g.items.map((i) => i.id)])).toEqual([
      ['today', ['a', 'b']],
      ['yesterday', ['c']],
      ['other', ['d']],
    ]);
  });
});
