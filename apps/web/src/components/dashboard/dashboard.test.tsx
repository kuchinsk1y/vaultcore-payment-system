import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';
import { ApiException, type AccountOptions, type AccountSummary, type Transaction } from '@/lib/api';

const topUpAccount = vi.fn();
const resendVerificationEmail = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  topUpAccount: (...args: unknown[]) => topUpAccount(...args),
  resendVerificationEmail: () => resendVerificationEmail(),
}));

import { GettingStarted } from './GettingStarted';
import { RecentTransactions } from './RecentTransactions';
import { TopUpModal } from './TopUpModal';

const accounts: AccountSummary[] = [
  { id: 'aaaaaaaa-0000-0000-0000-00000000eur1', currency: 'EUR', balance: 10 },
  { id: 'bbbbbbbb-0000-0000-0000-00000000usd1', currency: 'USD', balance: 0 },
];
const options: AccountOptions = { currencies: ['EUR', 'PLN', 'USD'], top_up: { enabled: true, max_per_request: 500_000, max_per_24h: 2_000_000 } };

describe('TopUpModal', () => {
  beforeEach(() => {
    topUpAccount.mockReset();
  });

  const open = (props: Partial<React.ComponentProps<typeof TopUpModal>> = {}) =>
    renderWithIntl(<TopUpModal open accounts={accounts} options={options} onClose={() => {}} onDone={() => {}} {...props} />);

  it('submits the typed amount in minor units for the chosen account', async () => {
    topUpAccount.mockResolvedValue({ transaction_id: 't', account_id: accounts[0].id, amount_minor: 12550, currency: 'EUR', remaining_24h: 0 });
    const onDone = vi.fn();
    open({ onDone });

    await userEvent.type(screen.getByLabelText(/^amount/i), '125,50');
    await userEvent.click(screen.getByRole('button', { name: 'Add funds' }));

    await waitFor(() => expect(topUpAccount).toHaveBeenCalledWith(accounts[0].id, 12550));
    expect(await screen.findByRole('status')).toHaveTextContent('Added €125.50 to your account.');
    expect(onDone).toHaveBeenCalled();
  });

  it('uses the selected account', async () => {
    topUpAccount.mockResolvedValue({ transaction_id: 't', account_id: accounts[1].id, amount_minor: 5000, currency: 'USD', remaining_24h: 0 });
    open();

    await userEvent.selectOptions(screen.getByLabelText('Account'), accounts[1].id);
    await userEvent.click(screen.getByRole('button', { name: '$50' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add funds' }));

    await waitFor(() => expect(topUpAccount).toHaveBeenCalledWith(accounts[1].id, 5000));
  });

  it('blocks invalid and over-limit amounts before calling the API', async () => {
    open();
    const submit = screen.getByRole('button', { name: 'Add funds' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^amount/i), '12.345');
    expect(screen.getByText('Enter an amount greater than zero.')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/^amount/i));
    await userEvent.type(screen.getByLabelText(/^amount/i), '5000.01');
    expect(screen.getByText('That is above the per-top-up limit.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(topUpAccount).not.toHaveBeenCalled();
  });

  it('explains the daily limit when the server refuses', async () => {
    topUpAccount.mockImplementation(() => Promise.reject(new ApiException('LIMIT_EXCEEDED', 'Daily top-up limit reached', 400)));
    open();

    await userEvent.type(screen.getByLabelText(/^amount/i), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Add funds' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached the 24-hour top-up limit.');
  });

  it('is disabled when top-ups are switched off', () => {
    open({ options: { ...options, top_up: { ...options.top_up, enabled: false } } });
    expect(screen.getByRole('alert')).toHaveTextContent('Top-ups are turned off in this environment.');
    expect(screen.getByRole('button', { name: 'Add funds' })).toBeDisabled();
  });

  it('renders nothing while closed', () => {
    open({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('GettingStarted', () => {
  const steps = [
    { id: 'verifyEmail' as const, done: false },
    { id: 'topUp' as const, done: false },
    { id: 'transfer' as const, done: true },
    { id: 'card' as const, done: false },
    { id: 'twoFactor' as const, done: false },
  ];

  it('shows progress and only the open steps\' descriptions', () => {
    renderWithIntl(<GettingStarted steps={steps} done={1} onTopUp={() => {}} />);

    expect(screen.getByText('1 of 5 done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Required before you can send money.')).toBeInTheDocument();
    expect(screen.queryByText('Send money to a saved contact or another account.')).not.toBeInTheDocument();
  });

  it('wires each step to its action', async () => {
    resendVerificationEmail.mockResolvedValue({ message: 'ok' });
    const onTopUp = vi.fn();
    renderWithIntl(<GettingStarted steps={steps} done={1} onTopUp={onTopUp} />);

    await userEvent.click(screen.getByRole('button', { name: 'Top up' }));
    expect(onTopUp).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(resendVerificationEmail).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Email sent' })).toBeDisabled();

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', '/cards');
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/settings');
  });
});

describe('RecentTransactions', () => {
  const tx = (over: Partial<Transaction>): Transaction => ({
    id: 'e1',
    transaction_id: 't1',
    date: new Date().toISOString(),
    kind: 'TRANSFER',
    direction: 'DEBIT',
    amount_minor: 2500,
    currency: 'EUR',
    description: null,
    account_id: 'aaaaaaaa-0000-0000-0000-00000000eur1',
    counterparty: { name: 'Ada Lovelace', account_id: 'x', is_self: false },
    ...over,
  });

  it('shows titles, signed amounts and a link to the full history', () => {
    renderWithIntl(
      <RecentTransactions
        transactions={[tx({}), tx({ id: 'e2', kind: 'TOP_UP', direction: 'CREDIT', amount_minor: 100000, counterparty: null })]}
        loading={false}
        error={false}
        onRetry={() => {}}
        visible
      />,
    );

    expect(screen.getByText('Transfer to Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('−€25.00')).toBeInTheDocument();
    expect(screen.getByText('+€1,000.00')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/transactions');
  });

  it('masks amounts when balances are hidden', () => {
    renderWithIntl(<RecentTransactions transactions={[tx({})]} loading={false} error={false} onRetry={() => {}} visible={false} />);
    expect(screen.queryByText('−€25.00')).not.toBeInTheDocument();
    expect(screen.getByText('••••')).toBeInTheDocument();
  });

  it('has an empty state, an error state with retry, and a loading state', async () => {
    const onRetry = vi.fn();
    const { rerender } = renderWithIntl(<RecentTransactions transactions={[]} loading={false} error={false} onRetry={onRetry} visible />);
    expect(screen.getByText('No transactions yet. Top up an account to get started.')).toBeInTheDocument();

    rerender(<RecentTransactions transactions={null} loading={false} error onRetry={onRetry} visible />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
