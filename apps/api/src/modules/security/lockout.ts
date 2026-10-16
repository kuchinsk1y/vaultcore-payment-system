export interface LockoutPolicy {
  maxAttempts: number;
  lockMinutes: number;
}

export interface LockoutState {
  attempts: number;
  lockedUntil: Date | null;
}

export function isLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** State after one more failed attempt: locks the account once `maxAttempts` is reached. */
export function registerFailure(
  current: LockoutState,
  policy: LockoutPolicy,
  now: Date = new Date(),
): LockoutState {
  // An expired lock starts a fresh counting window
  const expired = current.lockedUntil !== null && !isLocked(current.lockedUntil, now);
  const attempts = (expired ? 0 : current.attempts) + 1;

  if (attempts >= policy.maxAttempts) {
    return { attempts, lockedUntil: new Date(now.getTime() + policy.lockMinutes * 60_000) };
  }
  return { attempts, lockedUntil: null };
}
