import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSummary } from '@/lib/api';
import { ApiException } from '@/lib/api';

const submitTransfer = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  submitTransfer: (...args: unknown[]) => submitTransfer(...args),
}));

import { useTransferForm } from './useTransferForm';

const accounts: AccountSummary[] = [{ id: 'eur-1', currency: 'EUR', balance: 5000 }];
const submitEvent = { preventDefault: () => {} } as React.FormEvent;

const confirmationRequired = {
  status: 'CONFIRMATION_REQUIRED' as const,
  confirmation_id: 'conf-1',
  method: 'EMAIL_OTP' as const,
  expires_at: '2030-01-01T00:00:00.000Z',
};

async function fillAndSubmit(result: ReturnType<typeof renderHook<ReturnType<typeof useTransferForm>, unknown>>['result']) {
  act(() => {
    result.current.setTargetAccountId('dest-1');
    result.current.setAmount('1500.00');
  });
  await act(async () => {
    await result.current.submit(submitEvent);
  });
}

describe('useTransferForm: large transfer confirmation', () => {
  beforeEach(() => {
    submitTransfer.mockReset();
  });

  it('holds the transfer for a code, then retries with the same payload and idempotency key', async () => {
    submitTransfer.mockResolvedValueOnce(confirmationRequired).mockResolvedValueOnce({ id: 't1', status: 'SUCCESS' });
    const { result } = renderHook(() => useTransferForm(accounts));

    await fillAndSubmit(result);

    expect(result.current.pendingConfirmation).toEqual(confirmationRequired);
    expect(result.current.status).toBe('idle');
    const [firstPayload, firstKey] = submitTransfer.mock.calls[0];
    expect(firstPayload).toMatchObject({ amount: 150000, destination_account_id: 'dest-1' });
    expect(firstPayload.confirmation_code).toBeUndefined();

    act(() => result.current.setConfirmationCode('123456'));
    await act(async () => {
      await result.current.confirm(submitEvent);
    });

    const [secondPayload, secondKey] = submitTransfer.mock.calls[1];
    expect(secondKey).toBe(firstKey);
    expect(secondPayload).toMatchObject({
      amount: 150000,
      destination_account_id: 'dest-1',
      confirmation_id: 'conf-1',
      confirmation_code: '123456',
    });
    expect(result.current.status).toBe('success');
    expect(result.current.pendingConfirmation).toBeNull();
  });

  it('stays on the confirmation step after a wrong code', async () => {
    submitTransfer
      .mockResolvedValueOnce(confirmationRequired)
      .mockRejectedValueOnce(new ApiException('CONFIRMATION_INVALID', 'The confirmation code is invalid or has expired', 400));
    const { result } = renderHook(() => useTransferForm(accounts));

    await fillAndSubmit(result);
    act(() => result.current.setConfirmationCode('000000'));
    await act(async () => {
      await result.current.confirm(submitEvent);
    });

    expect(result.current.pendingConfirmation).not.toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/invalid or has expired/);
  });

  it('does not submit a confirmation without a full 6-digit code', async () => {
    submitTransfer.mockResolvedValueOnce(confirmationRequired);
    const { result } = renderHook(() => useTransferForm(accounts));

    await fillAndSubmit(result);
    act(() => result.current.setConfirmationCode('123'));
    await act(async () => {
      await result.current.confirm(submitEvent);
    });

    expect(submitTransfer).toHaveBeenCalledTimes(1);
  });

  it('cancelling discards the pending confirmation', async () => {
    submitTransfer.mockResolvedValueOnce(confirmationRequired);
    const { result } = renderHook(() => useTransferForm(accounts));

    await fillAndSubmit(result);
    act(() => result.current.cancelConfirmation());

    expect(result.current.pendingConfirmation).toBeNull();
    expect(result.current.confirmationCode).toBe('');
  });
});
