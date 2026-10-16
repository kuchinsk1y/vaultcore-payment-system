import type { PortfolioItem } from './api';

export interface BalanceChange {
  /** Difference in the display currency, in major units. */
  absolute: number;
  /** Fractional change relative to the starting balance (0.05 = +5%), or null if it started at zero. */
  fraction: number | null;
}

/**
 * Change over the period covered by a balance series (oldest first). Returns null when there is not
 * enough data to say anything honest, so the UI can hide the figure instead of inventing one.
 */
export function computeChange(series: PortfolioItem[]): BalanceChange | null {
  if (series.length < 2) return null;

  const first = series[0].balance;
  const last = series[series.length - 1].balance;
  if (first === last) return { absolute: 0, fraction: first === 0 ? null : 0 };

  return { absolute: last - first, fraction: first === 0 ? null : (last - first) / Math.abs(first) };
}

/** True when nothing ever happened: every point of the series is zero. */
export function isEmptySeries(series: PortfolioItem[]): boolean {
  return series.every((point) => point.balance === 0);
}
