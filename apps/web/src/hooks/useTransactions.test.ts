import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction, TransactionPage } from '@/lib/api';

const fetchTransactions = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchTransactions: (...args: unknown[]) => fetchTransactions(...args),
}));

import { EMPTY_FILTERS, dayRange, toApiFilters, useTransactions } from './useTransactions';

const tx = (id: string): Transaction => ({
  id,
  transaction_id: `t-${id}`,
  date: '2026-03-01T10:00:00Z',
  kind: 'TRANSFER',
  direction: 'DEBIT',
  amount_minor: 100,
  currency: 'EUR',
  description: null,
  account_id: 'a',
  counterparty: null,
});

const page = (ids: string[], next: string | null = null): TransactionPage => ({ items: ids.map(tx), next_cursor: next });

describe('filter helpers', () => {
  it('turns local dates into an inclusive range', () => {
    const { from, to } = dayRange('2026-03-01', '2026-03-02');
    expect(new Date(from!).getTime()).toBe(new Date('2026-03-01T00:00:00').getTime());
    expect(new Date(to!).getTime()).toBe(new Date('2026-03-02T23:59:59.999').getTime());
    expect(dayRange('', '')).toEqual({ from: undefined, to: undefined });
  });

  it('drops empty values and trims the search text', () => {
    expect(toApiFilters(EMPTY_FILTERS)).toEqual({ from: undefined, to: undefined });
    expect(toApiFilters({ ...EMPTY_FILTERS, q: '  ada ', kind: 'TOP_UP', direction: 'CREDIT', account_id: 'a1' })).toMatchObject({
      q: 'ada',
      kind: 'TOP_UP',
      direction: 'CREDIT',
      account_id: 'a1',
    });
  });
});

describe('useTransactions', () => {
  beforeEach(() => {
    fetchTransactions.mockReset();
  });

  it('loads the first page, then appends the next one with the cursor', async () => {
    fetchTransactions.mockResolvedValueOnce(page(['1', '2'], 'cursor-1')).mockResolvedValueOnce(page(['3']));
    const { result } = renderHook(() => useTransactions());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(['1', '2']);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(fetchTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1', limit: 20 }));
    expect(result.current.items.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(result.current.hasMore).toBe(false);
  });

  it('refetches from the start when a filter changes', async () => {
    fetchTransactions.mockResolvedValueOnce(page(['1'])).mockResolvedValueOnce(page(['9']));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.update({ direction: 'CREDIT' }));

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['9']));
    expect(fetchTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 'CREDIT' }));
    expect(fetchTransactions.mock.calls.at(-1)?.[0].cursor).toBeUndefined();
    expect(result.current.hasFilters).toBe(true);

    fetchTransactions.mockResolvedValueOnce(page(['1']));
    act(() => result.current.clear());
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['1']));
    expect(result.current.hasFilters).toBe(false);
  });

  it('ignores a slow response that arrives after a newer request', async () => {
    let resolveSlow: (p: TransactionPage) => void = () => {};
    fetchTransactions
      .mockReturnValueOnce(new Promise<TransactionPage>((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(page(['fresh']));

    const { result } = renderHook(() => useTransactions());
    act(() => result.current.update({ kind: 'EXCHANGE' }));
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['fresh']));

    await act(async () => resolveSlow(page(['stale'])));
    expect(result.current.items.map((i) => i.id)).toEqual(['fresh']);
  });

  it('reports a failed first load and recovers on retry', async () => {
    fetchTransactions.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(page(['1']));
    const { result } = renderHook(() => useTransactions());

    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.error).toBe(false);
  });
});
