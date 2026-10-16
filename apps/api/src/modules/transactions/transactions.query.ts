import { z } from 'zod';

// Pure helpers for the transaction history: filter parsing, cursors, LIKE escaping and CSV output.

export const TRANSACTION_KINDS = ['TRANSFER', 'EXCHANGE', 'TOP_UP', 'DEPOSIT', 'OTHER'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

const filterFields = {
  account_id: z.string().uuid().optional(),
  direction: z.enum(['CREDIT', 'DEBIT']).optional(),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(100).optional(),
};

const refineRange = (v: { from?: Date; to?: Date }) => !v.from || !v.to || v.from <= v.to;
const rangeError = { message: '"from" must not be after "to"', path: ['from'] };

export const ListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().max(500).optional(),
    ...filterFields,
  })
  .refine(refineRange, rangeError);

export const ExportQuerySchema = z.object(filterFields).refine(refineRange, rangeError);

export type TransactionFilters = z.infer<typeof ExportQuerySchema>;
export type TransactionListQuery = z.infer<typeof ListQuerySchema>;

// ---- Cursor ------------------------------------------------------------------------------------
// The cursor carries the raw database timestamp (microsecond precision, as text) and the row id, so
// paging is exact even when many rows share the same millisecond.

export interface Cursor {
  /** `created_at` exactly as Postgres prints it. */
  t: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

const CursorSchema = z.object({ t: z.string().min(10).max(40), id: z.string().uuid() });

/** Returns null for anything that is not a cursor this API produced. */
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---- Search ------------------------------------------------------------------------------------

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---- CSV ---------------------------------------------------------------------------------------

/**
 * Escapes a CSV cell. Cells that start with =, +, - or @ are prefixed with an apostrophe so a
 * spreadsheet never evaluates them as formulas (CSV injection), e.g. a counterparty named "=HYPERLINK(...)".
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Plain numbers (e.g. -12.00) cannot be formulas and must stay numeric in a spreadsheet
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(text);
  if (!isPlainNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  // BOM so Excel opens the file as UTF-8; CRLF line endings per RFC 4180
  return '\ufeff' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Signed decimal amount, e.g. DEBIT 12345 -> "-123.45". All supported currencies have 2 decimals. */
export function signedAmount(direction: 'CREDIT' | 'DEBIT', amountMinor: number): string {
  const value = (amountMinor / 100).toFixed(2);
  return direction === 'DEBIT' ? `-${value}` : value;
}
