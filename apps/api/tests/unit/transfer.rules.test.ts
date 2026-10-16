import { describe, it, expect } from 'vitest';
import { assertTransferAllowed, type TransferContext } from '../../src/modules/transfers/transfer.rules';
import { TransferError } from '../../src/modules/transfers/transfer.errors';

const base: TransferContext = {
  userId: 'user-1',
  currency: 'EUR',
  amount: 1000,
  sourceAccountId: 'acc-a',
  destinationAccountId: 'acc-b',
  source: { currency: 'EUR', user_id: 'user-1' },
  sourceBalance: 5000n,
  destination: { currency: 'EUR' },
};

const codeOf = (ctx: TransferContext) => {
  try {
    assertTransferAllowed(ctx);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(TransferError);
    return (e as TransferError).code;
  }
};

describe('assertTransferAllowed', () => {
  it('accepts a valid transfer', () => {
    expect(codeOf(base)).toBeNull();
  });

  it('accepts a transfer of the exact balance', () => {
    expect(codeOf({ ...base, amount: 5000 })).toBeNull();
  });

  it('rejects a transfer to the same account', () => {
    expect(codeOf({ ...base, destinationAccountId: 'acc-a' })).toBe('SAME_ACCOUNT_TRANSFER');
  });

  it('rejects an unknown source account', () => {
    expect(codeOf({ ...base, source: undefined })).toBe('ACCOUNT_NOT_FOUND');
  });

  it('rejects a source account owned by someone else', () => {
    expect(codeOf({ ...base, source: { currency: 'EUR', user_id: 'user-2' } })).toBe('UNAUTHORIZED_ACCOUNT');
  });

  it('rejects when the source currency differs', () => {
    expect(codeOf({ ...base, source: { currency: 'USD', user_id: 'user-1' } })).toBe('CURRENCY_MISMATCH');
  });

  it('rejects insufficient funds', () => {
    expect(codeOf({ ...base, amount: 5001 })).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects an unknown destination account', () => {
    expect(codeOf({ ...base, destination: undefined })).toBe('ACCOUNT_NOT_FOUND');
  });

  it('rejects when the destination currency differs', () => {
    expect(codeOf({ ...base, destination: { currency: 'USD' } })).toBe('CURRENCY_MISMATCH');
  });
});
