import { sql } from 'kysely';
import { db } from '../../infrastructure/database';
import { buildPortfolioSeries, makeRateToEUR, summarize } from './analytics.calculations';

async function loadRateToEUR() {
  const rates = await db.selectFrom('exchange_rates').selectAll().execute();
  return makeRateToEUR(rates.map((r) => ({ ...r, rate: String(r.rate) })));
}

export const AnalyticsService = {
  /** Income / expense totals (normalised to EUR) for the current month. */
  async getSummary(userId: string) {
    const entries = await db
      .selectFrom('ledger_entries as le')
      .innerJoin('accounts as a', 'a.id', 'le.account_id')
      .innerJoin('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
      .select(['le.id', 'le.ledger_transaction_id', 'le.direction', 'le.amount', 'le.currency', 'lt.description'])
      .where('a.user_id', '=', userId)
      .where('le.created_at', '>=', sql<Date>`date_trunc('month', current_date)`)
      .execute();

    const rateToEUR = await loadRateToEUR();
    const { totalIncome, totalExpenses, categories } = summarize(entries, rateToEUR);

    return {
      base_currency: 'EUR',
      total_income: totalIncome,
      total_expenses: totalExpenses,
      categories,
    };
  },

  /** Daily EUR balance for the last 30 days. */
  async getPortfolioSeries(userId: string) {
    const accountsRows = await db
      .selectFrom('accounts as a')
      .leftJoin('ledger_entries as le', 'a.id', 'le.account_id')
      .select([
        'a.currency',
        db.fn
          .coalesce(sql<string>`SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)`, sql<string>`'0'`)
          .as('balance'),
      ])
      .where('a.user_id', '=', userId)
      .where('a.status', '=', 'ACTIVE')
      .groupBy('a.id')
      .execute();

    const rateToEUR = await loadRateToEUR();
    const currentTotalEUR = accountsRows.reduce(
      (sum, acc) => sum + (Number(acc.balance) / 100) * rateToEUR(acc.currency),
      0,
    );

    const entries = await db
      .selectFrom('ledger_entries as le')
      .innerJoin('accounts as a', 'a.id', 'le.account_id')
      .where('a.user_id', '=', userId)
      .select(['le.amount', 'le.direction', 'le.currency', 'le.created_at'])
      .execute();

    return buildPortfolioSeries(currentTotalEUR, entries, rateToEUR);
  },
};
