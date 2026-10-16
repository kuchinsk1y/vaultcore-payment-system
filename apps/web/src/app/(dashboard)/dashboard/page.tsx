"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AccountDrawer } from '@/components/AccountDrawer';
import { PageShell } from '@/components/ui/PageShell';
import { BalanceToggle } from '@/components/BalanceToggle';
import { AccountsRow } from '@/components/dashboard/AccountsRow';
import { BalanceCard } from '@/components/dashboard/BalanceCard';
import { Cashflow } from '@/components/dashboard/Cashflow';
import { GettingStarted } from '@/components/dashboard/GettingStarted';
import { OpenAccountModal } from '@/components/dashboard/OpenAccountModal';
import { PerformanceChart } from '@/components/dashboard/PerformanceChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { SpendingBreakdown } from '@/components/dashboard/SpendingBreakdown';
import { TopUpModal } from '@/components/dashboard/TopUpModal';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { AccountSummary } from '@/lib/api';
import { computeOnboarding } from '@/lib/onboarding';
import { useAppStore } from '@/store/useAppStore';

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const visible = useAppStore((state) => state.isBalanceVisible);
  const data = useDashboardData();

  const [selectedAccount, setSelectedAccount] = useState<AccountSummary | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [openAccountOpen, setOpenAccountOpen] = useState(false);

  const name = data.profile.data?.full_name;
  const accounts = data.accounts.data;
  const onboarding = computeOnboarding({
    profile: data.profile.data,
    accounts,
    hasSentTransfer: data.sentTransfer.data,
    hasTransactions: data.recent.data ? data.recent.data.items.length > 0 : null,
    cards: data.cards.data,
  });

  const totalExpenses = data.summary.data?.total_expenses ?? 0;

  return (
    <PageShell title={t('title')} subtitle={name ? t('welcome', { name }) : t('welcomeGeneric')} actions={<BalanceToggle />}>

      {onboarding.ready && !onboarding.complete && (
        <GettingStarted steps={onboarding.steps} done={onboarding.done} onTopUp={() => setTopUpOpen(true)} />
      )}

      <AccountsRow
        accounts={accounts}
        loading={data.accounts.loading}
        error={data.accounts.error}
        onRetry={data.accounts.reload}
        visible={visible}
        onSelect={setSelectedAccount}
        onOpenAccount={() => setOpenAccountOpen(true)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BalanceCard
          loading={data.portfolio.loading && !data.portfolio.data}
          error={data.portfolio.error && !data.portfolio.data}
          onRetry={data.portfolio.reload}
          total={data.totalBalance}
          change={data.change}
          visible={visible}
          onTopUp={() => setTopUpOpen(true)}
        />
        <Cashflow
          income={data.summary.data?.total_income ?? 0}
          expenses={totalExpenses}
          loading={data.summary.loading && !data.summary.data}
          error={data.summary.error && !data.summary.data}
          onRetry={data.summary.reload}
          visible={visible}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PerformanceChart
          series={data.portfolio.data}
          loading={data.portfolio.loading}
          error={data.portfolio.error}
          onRetry={data.portfolio.reload}
          visible={visible}
        />
        <SpendingBreakdown
          categories={data.summary.data?.categories ?? []}
          total={totalExpenses}
          loading={data.summary.loading && !data.summary.data}
          error={data.summary.error && !data.summary.data}
          onRetry={data.summary.reload}
          visible={visible}
        />
      </div>

      <RecentTransactions
        transactions={data.recent.data?.items ?? null}
        loading={data.recent.loading}
        error={data.recent.error}
        onRetry={data.recent.reload}
        visible={visible}
      />

      <AccountDrawer isOpen={!!selectedAccount} onClose={() => setSelectedAccount(null)} account={selectedAccount} />

      <TopUpModal
        open={topUpOpen}
        accounts={accounts ?? []}
        options={data.options.data}
        onClose={() => setTopUpOpen(false)}
        onDone={data.reloadAll}
      />
      <OpenAccountModal
        open={openAccountOpen}
        heldCurrencies={(accounts ?? []).map((a) => a.currency)}
        onClose={() => setOpenAccountOpen(false)}
        onDone={data.reloadAll}
      />
    </PageShell>
  );
}
