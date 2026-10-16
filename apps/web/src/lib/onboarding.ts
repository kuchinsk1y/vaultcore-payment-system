import type { AccountSummary, Card, UserProfile } from './api';

export type OnboardingStepId = 'verifyEmail' | 'topUp' | 'transfer' | 'card' | 'twoFactor';

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
}

export interface OnboardingInput {
  profile: Pick<UserProfile, 'email_verified' | 'two_factor_enabled'> | null;
  accounts: Pick<AccountSummary, 'balance'>[] | null;
  /** Whether the user has ever sent a transfer. */
  hasSentTransfer: boolean | null;
  hasTransactions: boolean | null;
  cards: Pick<Card, 'id'>[] | null;
}

/**
 * The checklist shown to new users. A step is only "done" when we positively know it is, so while
 * data is still loading nothing is reported as completed.
 */
export function computeOnboarding(input: OnboardingInput): { steps: OnboardingStep[]; done: number; complete: boolean; ready: boolean } {
  const funded = (input.accounts ?? []).some((a) => (a.balance ?? 0) > 0) || input.hasTransactions === true;

  const steps: OnboardingStep[] = [
    { id: 'verifyEmail', done: input.profile?.email_verified === true },
    { id: 'topUp', done: funded },
    { id: 'transfer', done: input.hasSentTransfer === true },
    { id: 'card', done: (input.cards?.length ?? 0) > 0 },
    { id: 'twoFactor', done: input.profile?.two_factor_enabled === true },
  ];

  const done = steps.filter((s) => s.done).length;
  const ready = input.profile !== null && input.accounts !== null && input.cards !== null && input.hasSentTransfer !== null;
  return { steps, done, complete: done === steps.length, ready };
}
