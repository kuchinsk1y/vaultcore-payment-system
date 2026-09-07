import { FastifyPluginAsync } from 'fastify';
import { db } from '../../infrastructure/database';
import { sql } from 'kysely';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/summary', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      // 1. Fetch all ledger entries for this user for the current month
      // In a real app we'd use local timezone bounds, here we use a simple date logic
      // Note: SQLite/Postgres date functions differ, we use Kysely sql builder for safety or just standard SQL if Postgres.
      // Assuming Postgres since dialect is PostgresDialect.
      
      const entries = await db
        .selectFrom('ledger_entries as le')
        .innerJoin('accounts as a', 'a.id', 'le.account_id')
        .innerJoin('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
        .select([
          'le.id',
          'le.ledger_transaction_id',
          'le.direction',
          'le.amount',
          'le.currency',
          'lt.description'
        ])
        .where('a.user_id', '=', request.userId)
        .where('le.created_at', '>=', sql<Date>`date_trunc('month', current_date)`)
        .execute();

      // 2. Fetch exchange rates to normalize to EUR
      const rates = await db
        .selectFrom('exchange_rates')
        .selectAll()
        .execute();

      const getRateToEUR = (currency: string) => {
        if (currency === 'EUR') return 1;
        const rate = rates.find(r => r.base_currency === currency && r.target_currency === 'EUR');
        return rate ? parseFloat(rate.rate as string) : 1; // Default to 1 if no rate (should not happen in our seed)
      };

      // 3. Process entries
      // Group by ledger_transaction_id to identify internal transfers/FX
      const txGroups = entries.reduce((acc, entry) => {
        if (!acc[entry.ledger_transaction_id]) {
          acc[entry.ledger_transaction_id] = [];
        }
        acc[entry.ledger_transaction_id].push(entry);
        return acc;
      }, {} as Record<string, typeof entries>);

      let totalIncome = 0;
      let totalExpenses = 0;
      const categories: Record<string, number> = {};

      for (const [txId, groupEntries] of Object.entries(txGroups)) {
        // If a transaction has multiple entries for the SAME user (e.g. DEBIT EUR, CREDIT USD),
        // it's an internal transfer or FX conversion. We skip it from top-line analytics.
        const isInternal = groupEntries.length >= 2 && groupEntries.some(e => e.direction === 'CREDIT') && groupEntries.some(e => e.direction === 'DEBIT');

        if (isInternal) continue;

        for (const entry of groupEntries) {
          const amountInMinor = parseFloat(entry.amount as string);
          const amountInMajor = amountInMinor / 100;
          const normalizedAmount = amountInMajor * getRateToEUR(entry.currency);

          let category = 'Other';
          const desc = entry.description?.toLowerCase() || '';
          
          if (desc.includes('salary') || desc.includes('deposit')) category = 'Income';
          else if (desc.includes('subscription') || desc.includes('netflix') || desc.includes('spotify')) category = 'Subscriptions';
          else if (desc.includes('groceries') || desc.includes('food')) category = 'Food & Groceries';
          else if (desc.includes('transfer')) category = 'Transfers';

          if (entry.direction === 'CREDIT') {
            totalIncome += normalizedAmount;
          } else {
            totalExpenses += normalizedAmount;
            
            // Track expense categories
            categories[category] = (categories[category] || 0) + normalizedAmount;
          }
        }
      }

      // Convert categories to array
      const categoryBreakdown = Object.entries(categories).map(([name, amount]) => ({
        category: name,
        amount
      })).sort((a, b) => b.amount - a.amount);

      return reply.send({
        base_currency: 'EUR',
        total_income: totalIncome,
        total_expenses: totalExpenses,
        categories: categoryBreakdown
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
