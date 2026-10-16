"use client";

import { useMemo } from 'react';
import {
  fetchAccountOptions,
  fetchAccounts,
  fetchAnalytics,
  fetchCards,
  fetchCurrentUser,
  fetchPortfolio,
  fetchTransactions,
} from '@/lib/api';
import { computeChange } from '@/lib/portfolio';
import { useAsync } from './useAsync';

/**
 * Everything the dashboard shows. Each section loads on its own, so one failing request leaves
 * the rest of the page usable and gets its own retry.
 */
export function useDashboardData() {
  const profile = useAsync(async () => (await fetchCurrentUser()).user);
  const accounts = useAsync(fetchAccounts);
  const options = useAsync(fetchAccountOptions);
  const portfolio = useAsync(fetchPortfolio);
  const summary = useAsync(fetchAnalytics);
  const recent = useAsync(() => fetchTransactions({ limit: 6 }));
  const cards = useAsync(async () => (await fetchCards()).data);
  const sentTransfer = useAsync(async () => (await fetchTransactions({ kind: 'TRANSFER', direction: 'DEBIT', limit: 1 })).items.length > 0);

  const change = useMemo(() => (portfolio.data ? computeChange(portfolio.data) : null), [portfolio.data]);
  const totalBalance = portfolio.data?.length ? portfolio.data[portfolio.data.length - 1].balance : 0;

  /** Call after anything that moves money so every section reflects it. */
  const reloadAll = () => {
    accounts.reload();
    portfolio.reload();
    summary.reload();
    recent.reload();
    sentTransfer.reload();
  };

  return { profile, accounts, options, portfolio, summary, recent, cards, sentTransfer, change, totalBalance, reloadAll };
}
