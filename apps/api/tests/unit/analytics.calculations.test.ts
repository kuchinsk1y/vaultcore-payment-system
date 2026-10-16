import { describe, it, expect } from 'vitest';
import {
  buildPortfolioSeries,
  categorize,
  makeRateToEUR,
  summarize,
  type SummaryEntry,
} from '../../src/modules/analytics/analytics.calculations';

const rateToEUR = makeRateToEUR([{ base_currency: 'USD', target_currency: 'EUR', rate: '0.9' }]);

describe('makeRateToEUR', () => {
  it('returns 1 for EUR and for unknown currencies, and the stored rate otherwise', () => {
    expect(rateToEUR('EUR')).toBe(1);
    expect(rateToEUR('USD')).toBeCloseTo(0.9);
    expect(rateToEUR('PLN')).toBe(1);
  });
});

describe('categorize', () => {
  it.each([
    ['Monthly salary', 'Income'],
    ['Netflix subscription', 'Subscriptions'],
    ['Groceries at Lidl', 'Food & Groceries'],
    ['Transfer to Anna', 'Transfers'],
    ['Something else', 'Other'],
    [null, 'Other'],
  ])('categorizes %s as %s', (description, expected) => {
    expect(categorize(description)).toBe(expected);
  });
});

describe('summarize', () => {
  const entry = (over: Partial<SummaryEntry>): SummaryEntry => ({
    ledger_transaction_id: 'tx-1',
    direction: 'DEBIT',
    amount: 1000,
    currency: 'EUR',
    description: null,
    ...over,
  });

  it('totals income and categorised expenses, converting to EUR', () => {
    const result = summarize(
      [
        entry({ ledger_transaction_id: 'a', direction: 'CREDIT', amount: 100000, description: 'Salary' }),
        entry({ ledger_transaction_id: 'b', amount: 2000, description: 'Netflix subscription' }),
        entry({ ledger_transaction_id: 'c', amount: 10000, currency: 'USD', description: 'Groceries' }),
      ],
      rateToEUR,
    );

    expect(result.totalIncome).toBeCloseTo(1000);
    expect(result.totalExpenses).toBeCloseTo(20 + 90);
    expect(result.categories).toEqual([
      { category: 'Food & Groceries', amount: expect.closeTo(90) },
      { category: 'Subscriptions', amount: expect.closeTo(20) },
    ]);
  });

  it('ignores internal transfers (a credit and a debit in the same transaction)', () => {
    const result = summarize(
      [
        entry({ ledger_transaction_id: 'fx', direction: 'DEBIT', amount: 5000 }),
        entry({ ledger_transaction_id: 'fx', direction: 'CREDIT', amount: 4500, currency: 'USD' }),
      ],
      rateToEUR,
    );

    expect(result.totalIncome).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.categories).toEqual([]);
  });
});

describe('buildPortfolioSeries', () => {
  it('walks back from the current balance and returns 31 chronological points', () => {
    const now = new Date('2026-03-31T12:00:00Z');
    const series = buildPortfolioSeries(
      150,
      [{ amount: 5000, direction: 'CREDIT', currency: 'EUR', created_at: '2026-03-31T08:00:00Z' }],
      rateToEUR,
      now,
    );

    expect(series).toHaveLength(31);
    expect(series[30]).toEqual({ date: '2026-03-31', balance: 150 });
    expect(series[29]).toEqual({ date: '2026-03-30', balance: 100 });
    expect(series[0].date).toBe('2026-03-01');
  });
});
