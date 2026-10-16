export class TransferError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'TransferError';
  }
}

export const transferErrors = {
  highRisk: () =>
    new TransferError('HIGH_RISK_BLOCKED', 403, {
      error: 'Forbidden',
      message: 'Transaction blocked by risk evaluation engine',
    }),
  insufficientFunds: () =>
    new TransferError('INSUFFICIENT_FUNDS', 400, { error: 'Bad Request', message: 'Insufficient funds' }),
  accountNotFound: () =>
    new TransferError('ACCOUNT_NOT_FOUND', 400, { error: 'Bad Request', message: 'Account not found' }),
  currencyMismatch: () =>
    new TransferError('CURRENCY_MISMATCH', 400, { error: 'Bad Request', message: 'Currency mismatch' }),
  sameAccount: () =>
    new TransferError('SAME_ACCOUNT_TRANSFER', 400, {
      error: 'Bad Request',
      message: 'Cannot transfer to the same account',
    }),
  confirmationInvalid: () =>
    new TransferError('CONFIRMATION_INVALID', 400, {
      error: 'Bad Request',
      code: 'CONFIRMATION_INVALID',
      message: 'The confirmation code is invalid or has expired',
    }),
  notAuthorized: () =>
    new TransferError('UNAUTHORIZED_ACCOUNT', 403, {
      error: 'Forbidden',
      message: 'Not authorized to transfer from this account',
    }),
};
