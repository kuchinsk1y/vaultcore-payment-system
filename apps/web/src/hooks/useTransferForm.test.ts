import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AccountSummary, Contact } from '@/lib/api';
import { useTransferForm } from './useTransferForm';

const accounts: AccountSummary[] = [
  { id: 'eur-1', currency: 'EUR', balance: 100 },
  { id: 'usd-1', currency: 'USD', balance: 50 },
];

const contact: Contact = {
  contact_id: 'c1',
  user_id: 'u2',
  full_name: 'Anna Nowak',
  email: 'anna@example.com',
  phone_number: '+48123123123',
  accounts: [{ account_id: 'anna-eur', currency: 'EUR' }],
};

describe('useTransferForm', () => {
  it('defaults the source to the first account', () => {
    const { result } = renderHook(() => useTransferForm(accounts));
    expect(result.current.sourceAccountId).toBe('eur-1');
    expect(result.current.sourceAccount?.currency).toBe('EUR');
  });

  it('fills the destination when the contact has an account in the same currency', () => {
    const { result } = renderHook(() => useTransferForm(accounts));

    act(() => result.current.selectContact(contact));

    expect(result.current.targetAccountId).toBe('anna-eur');
    expect(result.current.errorMessage).toBe('');
  });

  it('explains the problem when the contact has no matching currency', () => {
    const { result } = renderHook(() => useTransferForm(accounts));

    act(() => result.current.changeSource('usd-1'));
    act(() => result.current.selectContact(contact));

    expect(result.current.targetAccountId).toBe('');
    expect(result.current.errorMessage).toContain('does not have a USD account');
    expect(result.current.errorMessage).toContain('EUR');
  });

  it('clears the destination when the source changes', () => {
    const { result } = renderHook(() => useTransferForm(accounts));

    act(() => result.current.selectContact(contact));
    act(() => result.current.changeSource('usd-1'));

    expect(result.current.targetAccountId).toBe('');
  });
});
