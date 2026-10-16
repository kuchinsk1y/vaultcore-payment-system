"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTransactions, type Transaction, type TransactionFilters, type TransactionKind } from '@/lib/api';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export interface FilterState {
  q: string;
  account_id: string;
  kind: '' | TransactionKind;
  direction: '' | 'CREDIT' | 'DEBIT';
  /** Local calendar dates as yyyy-mm-dd, straight from <input type="date">. */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: FilterState = { q: '', account_id: '', kind: '', direction: '', from: '', to: '' };

/** Start / end of a local calendar day as ISO timestamps, so "to" includes the whole last day. */
export function dayRange(from: string, to: string): { from?: string; to?: string } {
  return {
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  };
}

/** Maps the form state to the API's filter parameters, dropping empty values. */
export function toApiFilters(state: FilterState): TransactionFilters {
  const filters: TransactionFilters = { ...dayRange(state.from, state.to) };
  if (state.q.trim()) filters.q = state.q.trim();
  if (state.account_id) filters.account_id = state.account_id;
  if (state.kind) filters.kind = state.kind;
  if (state.direction) filters.direction = state.direction;
  return filters;
}

export function useTransactions() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Typing in the search box should not fire a request per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(filters.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const apiFilters = useMemo(
    () => toApiFilters({ ...filters, q: debouncedQuery }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedQuery, filters.account_id, filters.kind, filters.direction, filters.from, filters.to],
  );
  const filtersKey = JSON.stringify(apiFilters);

  // Identifies the latest request so a slow, older response can never overwrite newer results
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    fetchTransactions({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })
      .then((page) => {
        if (id !== requestId.current) return;
        setItems(page.items);
        setNextCursor(page.next_cursor);
        setError(false);
      })
      .catch((err) => {
        console.error(err);
        if (id === requestId.current) setError(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [filtersKey, reloadKey]);

  const update = useCallback((patch: Partial<FilterState>) => {
    setLoading(true);
    setError(false);
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => {
    setLoading(true);
    setError(false);
    setDebouncedQuery('');
    setFilters(EMPTY_FILTERS);
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setError(false);
    setReloadKey((k) => k + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchTransactions({ ...JSON.parse(filtersKey), limit: PAGE_SIZE, cursor: nextCursor });
      if (id !== requestId.current) return; // filters changed while loading
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, filtersKey]);

  const hasFilters = useMemo(() => JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS), [filters]);

  return { filters, update, clear, hasFilters, apiFilters, items, loading, loadingMore, error, retry, loadMore, hasMore: nextCursor !== null };
}
