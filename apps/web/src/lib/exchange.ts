import type { FxRate } from './api';

export interface Quote {
  rate: number;
  /** What the destination account receives, in minor units. */
  convertedMinor: number;
}

/**
 * Preview of a conversion. Mirrors the API, which truncates (floors) the converted amount, so the
 * number shown here is exactly what will be credited.
 */
export function quote(rates: FxRate[], from: string, to: string, amountMinor: number): Quote | null {
  if (from === to) return null;

  const entry = rates.find((r) => r.base_currency === from && r.target_currency === to);
  if (!entry) return null;

  const rate = Number(entry.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return { rate, convertedMinor: Math.floor(amountMinor * rate) };
}
