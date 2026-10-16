import { sql } from 'kysely';
import { db } from '../../infrastructure/database';
import { SYSTEM_USER_ID } from '../../infrastructure/system';
import {
  decodeCursor,
  encodeCursor,
  escapeLike,
  signedAmount,
  toCsv,
  type TransactionFilters,
} from './transactions.query';

export interface TransactionItem {
  /** Ledger entry id (unique per account leg). */
  id: string;
  transaction_id: string;
  date: string;
  kind: 'TRANSFER' | 'EXCHANGE' | 'TOP_UP' | 'DEPOSIT' | 'OTHER';
  direction: 'CREDIT' | 'DEBIT';
  /** Amount in minor units (cents); always positive, the sign is given by `direction`. */
  amount_minor: number;
  currency: string;
  description: string | null;
  account_id: string;
  counterparty: { name: string; account_id: string; is_self: boolean } | null;
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor');
  }
}

export const EXPORT_ROW_LIMIT = 5000;

/** Entries of every account owned by `userId`, filtered. Ordering and paging are applied by callers. */
function baseQuery(userId: string, filters: TransactionFilters) {
  let query = db
    .selectFrom('ledger_entries as le')
    .innerJoin('accounts as a', 'a.id', 'le.account_id')
    .innerJoin('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
    .select([
      'le.id',
      'le.ledger_transaction_id',
      'le.account_id',
      'le.direction',
      'le.amount',
      'le.currency',
      'lt.kind',
      'lt.description',
      sql<string>`le.created_at::text`.as('created_at_raw'),
      sql<string>`to_json(le.created_at)#>>'{}'`.as('created_at_iso'),
    ])
    .where('a.user_id', '=', userId);

  if (filters.account_id) query = query.where('le.account_id', '=', filters.account_id);
  if (filters.direction) query = query.where('le.direction', '=', filters.direction);
  if (filters.kind) query = query.where('lt.kind', '=', filters.kind);
  if (filters.from) query = query.where('le.created_at', '>=', filters.from);
  if (filters.to) query = query.where('le.created_at', '<=', filters.to);

  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    query = query.where(
      sql<boolean>`(
        lt.description ILIKE ${pattern}
        OR EXISTS (
          SELECT 1
          FROM ledger_entries le2
          JOIN accounts a2 ON a2.id = le2.account_id
          JOIN users u2 ON u2.id = a2.user_id
          WHERE le2.ledger_transaction_id = le.ledger_transaction_id
            AND le2.account_id <> le.account_id
            AND a2.user_id <> ${SYSTEM_USER_ID}::uuid
            AND (u2.full_name ILIKE ${pattern} OR u2.email ILIKE ${pattern})
        )
      )`,
    );
  }

  return query;
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

type Leg = Awaited<ReturnType<typeof fetchLegs>>[number];

function fetchLegs(transactionIds: string[]) {
  return db
    .selectFrom('ledger_entries as le')
    .innerJoin('accounts as a', 'a.id', 'le.account_id')
    .innerJoin('users as u', 'u.id', 'a.user_id')
    .select(['le.ledger_transaction_id', 'le.account_id', 'a.user_id', 'u.full_name', 'u.email'])
    .where('le.ledger_transaction_id', 'in', transactionIds)
    // System clearing accounts are bookkeeping, not a counterparty a user should see
    .where('a.user_id', '!=', SYSTEM_USER_ID)
    .execute();
}

/** Legs of the given transactions, grouped by transaction id. */
async function loadLegs(rows: Row[]): Promise<Map<string, Leg[]>> {
  const grouped = new Map<string, Leg[]>();
  const transactionIds = [...new Set(rows.map((r) => r.ledger_transaction_id))];
  if (transactionIds.length === 0) return grouped;

  for (const leg of await fetchLegs(transactionIds)) {
    const list = grouped.get(leg.ledger_transaction_id) ?? [];
    list.push(leg);
    grouped.set(leg.ledger_transaction_id, list);
  }
  return grouped;
}

async function toItems(userId: string, rows: Row[]): Promise<TransactionItem[]> {
  const legsByTransaction = await loadLegs(rows);

  return rows.map((row) => {
    const other = legsByTransaction
      .get(row.ledger_transaction_id)
      ?.find((leg) => leg.account_id !== row.account_id);

    return {
      id: row.id,
      transaction_id: row.ledger_transaction_id,
      date: row.created_at_iso,
      kind: row.kind,
      direction: row.direction,
      amount_minor: Number(row.amount),
      currency: row.currency,
      description: row.description,
      account_id: row.account_id,
      counterparty: other
        ? { name: other.full_name || other.email, account_id: other.account_id, is_self: other.user_id === userId }
        : null,
    };
  });
}

export const TransactionsService = {
  /** One page of history, newest first. `next_cursor` is null on the last page. */
  async list(userId: string, filters: TransactionFilters & { limit: number; cursor?: string }) {
    let query = baseQuery(userId, filters);

    if (filters.cursor) {
      const cursor = decodeCursor(filters.cursor);
      if (!cursor) throw new InvalidCursorError();
      query = query.where(sql<boolean>`(le.created_at, le.id) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`);
    }

    const rows = await query
      .orderBy('le.created_at', 'desc')
      .orderBy('le.id', 'desc')
      .limit(filters.limit + 1)
      .execute();

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: await toItems(userId, page),
      next_cursor: hasMore && last ? encodeCursor({ t: last.created_at_raw, id: last.id }) : null,
    };
  },

  /** CSV of the (filtered) history, capped at EXPORT_ROW_LIMIT rows. */
  async exportCsv(userId: string, filters: TransactionFilters) {
    const rows = await baseQuery(userId, filters)
      .orderBy('le.created_at', 'desc')
      .orderBy('le.id', 'desc')
      .limit(EXPORT_ROW_LIMIT)
      .execute();

    const items = await toItems(userId, rows);
    return toCsv(
      ['Date', 'Type', 'Description', 'Counterparty', 'Account', 'Amount', 'Currency'],
      items.map((item) => [
        item.date,
        item.kind,
        item.description,
        item.counterparty?.name ?? '',
        item.account_id,
        signedAmount(item.direction, item.amount_minor),
        item.currency,
      ]),
    );
  },
};
