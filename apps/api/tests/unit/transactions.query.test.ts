import { describe, it, expect } from 'vitest';
import {
  csvCell,
  decodeCursor,
  encodeCursor,
  escapeLike,
  ExportQuerySchema,
  ListQuerySchema,
  signedAmount,
  toCsv,
} from '../../src/modules/transactions/transactions.query';

describe('cursor', () => {
  const cursor = { t: '2026-03-01 12:00:00.123456+00', id: '3f2b8d1e-6c1a-4d57-9a53-1d2e3f4a5b6c' };

  it('round-trips and keeps microsecond precision', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['not base64 json', 'abc'],
    ['empty', ''],
    ['wrong shape', Buffer.from(JSON.stringify({ foo: 1 })).toString('base64url')],
    ['bad uuid', Buffer.from(JSON.stringify({ t: '2026-03-01 12:00:00+00', id: 'nope' })).toString('base64url')],
  ])('rejects %s', (_label, value) => {
    expect(decodeCursor(value)).toBeNull();
  });
});

describe('escapeLike', () => {
  it('neutralises LIKE wildcards and the escape character', () => {
    expect(escapeLike('100%_done')).toBe('100\\%\\_done');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('csv', () => {
  it('quotes cells with commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it.each(['=SUM(A1:A9)', '+1+1', '-2+3', '@cmd', '\tTAB'])('defuses formula injection for %j', (value) => {
    expect(csvCell(value).replace(/^"/, '')).toMatch(/^'/);
  });

  it('keeps plain negative numbers numeric (they cannot be formulas)', () => {
    expect(csvCell('-12.00')).toBe('-12.00');
    expect(csvCell('123.45')).toBe('123.45');
  });

  it('builds RFC 4180 output with BOM and CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', 'x,y']]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toBe('\ufeffA,B\r\n1,"x,y"\r\n');
  });
});

describe('signedAmount', () => {
  it('formats minor units with the sign of the direction', () => {
    expect(signedAmount('CREDIT', 12345)).toBe('123.45');
    expect(signedAmount('DEBIT', 12345)).toBe('-123.45');
    expect(signedAmount('CREDIT', 5)).toBe('0.05');
  });
});

describe('query schemas', () => {
  it('applies defaults and coerces types', () => {
    const q = ListQuerySchema.parse({ limit: '50', from: '2026-01-01' });
    expect(q.limit).toBe(50);
    expect(q.from).toBeInstanceOf(Date);
    expect(ListQuerySchema.parse({}).limit).toBe(20);
  });

  it.each([{ limit: '0' }, { limit: '101' }, { direction: 'SIDEWAYS' }, { kind: 'GIFT' }, { account_id: 'x' }, { from: 'yesterday-ish' }])(
    'rejects %j',
    (query) => {
      expect(ListQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it('rejects an inverted date range', () => {
    expect(ExportQuerySchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false);
    expect(ExportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-02-01' }).success).toBe(true);
  });
});
