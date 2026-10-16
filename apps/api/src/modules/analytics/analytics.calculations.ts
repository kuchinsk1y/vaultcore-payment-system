// Pure analytics calculations: no I/O, so they can be unit-tested in isolation.

export interface RateRow {
  base_currency: string;
  target_currency: string;
  rate: string | number;
}

export interface SummaryEntry {
  ledger_transaction_id: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: string | number;
  currency: string;
  description: string | null;
}

export interface PortfolioEntry {
  amount: string | number;
  direction: 'CREDIT' | 'DEBIT';
  currency: string;
  created_at: Date | string;
}

export interface CategoryTotal {
  category: string;
  amount: number;
}

export function makeRateToEUR(rates: RateRow[]) {
  return (currency: string): number => {
    if (currency === 'EUR') return 1;
    const rate = rates.find((r) => r.base_currency === currency && r.target_currency === 'EUR');
    return rate ? parseFloat(String(rate.rate)) : 1; // default to 1 if no rate is known
  };
}

export function categorize(description: string | null): string {
  const desc = description?.toLowerCase() || '';
  if (desc.includes('salary') || desc.includes('deposit')) return 'Income';
  if (desc.includes('subscription') || desc.includes('netflix') || desc.includes('spotify')) return 'Subscriptions';
  if (desc.includes('groceries') || desc.includes('food')) return 'Food & Groceries';
  if (desc.includes('transfer')) return 'Transfers';
  return 'Other';
}

export function summarize(entries: SummaryEntry[], rateToEUR: (currency: string) => number) {
  const groups = new Map<string, SummaryEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.ledger_transaction_id) ?? [];
    group.push(entry);
    groups.set(entry.ledger_transaction_id, group);
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  const categories: Record<string, number> = {};

  for (const group of groups.values()) {
    // A transaction with both a credit and a debit for the same user is an internal transfer or FX
    // conversion; it is excluded from top-line analytics.
    const isInternal =
      group.length >= 2 && group.some((e) => e.direction === 'CREDIT') && group.some((e) => e.direction === 'DEBIT');
    if (isInternal) continue;

    for (const entry of group) {
      const normalized = (parseFloat(String(entry.amount)) / 100) * rateToEUR(entry.currency);

      if (entry.direction === 'CREDIT') {
        totalIncome += normalized;
      } else {
        totalExpenses += normalized;
        const category = categorize(entry.description);
        categories[category] = (categories[category] || 0) + normalized;
      }
    }
  }

  const categoryBreakdown: CategoryTotal[] = Object.entries(categories)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return { totalIncome, totalExpenses, categories: categoryBreakdown };
}

/**
 * Reconstructs the daily end-of-day balance (in EUR) for the last `days` days by walking back from
 * the current total and undoing each day's net change. Result is in chronological order.
 */
export function buildPortfolioSeries(
  currentTotalEUR: number,
  entries: PortfolioEntry[],
  rateToEUR: (currency: string) => number,
  now: Date = new Date(),
  days = 30,
) {
  const dailyChanges: Record<string, number> = {};
  for (const entry of entries) {
    const dateStr = new Date(entry.created_at).toISOString().split('T')[0];
    const amountEUR = (parseFloat(String(entry.amount)) / 100) * rateToEUR(entry.currency);
    // CREDIT: money entered the account. DEBIT: money left.
    dailyChanges[dateStr] = (dailyChanges[dateStr] || 0) + (entry.direction === 'CREDIT' ? amountEUR : -amountEUR);
  }

  const data: { date: string; balance: number }[] = [];
  let runningBalance = currentTotalEUR;

  for (let i = 0; i <= days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    data.push({ date: dateStr, balance: runningBalance });
    runningBalance -= dailyChanges[dateStr] || 0;
  }

  return data.reverse();
}
