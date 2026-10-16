import { transferErrors } from './transfer.errors';

export interface TransferContext {
  userId: string;
  currency: string;
  amount: number;
  sourceAccountId: string;
  destinationAccountId: string;
  source?: { currency: string; user_id: string } | null;
  sourceBalance: bigint;
  destination?: { currency: string } | null;
}

/**
 * Pure business rules for a transfer. Throws a TransferError describing the first violated rule.
 * Kept free of I/O so it can be unit-tested without a database.
 */
export function assertTransferAllowed(ctx: TransferContext): void {
  if (ctx.sourceAccountId === ctx.destinationAccountId) throw transferErrors.sameAccount();
  if (!ctx.source) throw transferErrors.accountNotFound();
  if (ctx.source.user_id !== ctx.userId) throw transferErrors.notAuthorized();
  if (ctx.source.currency !== ctx.currency) throw transferErrors.currencyMismatch();
  if (ctx.sourceBalance < BigInt(ctx.amount)) throw transferErrors.insufficientFunds();
  if (!ctx.destination) throw transferErrors.accountNotFound();
  if (ctx.destination.currency !== ctx.currency) throw transferErrors.currencyMismatch();
}
