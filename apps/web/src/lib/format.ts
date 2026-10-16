// Locale-aware formatting helpers. Money is stored in minor units (cents); every supported
// currency has two decimals, which is what Intl produces for these ISO codes.

const MINOR_UNITS_PER_MAJOR = 100;

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
  options: { signDisplay?: Intl.NumberFormatOptions['signDisplay'] } = {},
): string {
  return formatMajor(amountMinor / MINOR_UNITS_PER_MAJOR, currency, locale, options);
}

/** For amounts the API already returns in major units (account balances, analytics totals). */
export function formatMajor(
  amountMajor: number,
  currency: string,
  locale: string,
  options: { signDisplay?: Intl.NumberFormatOptions['signDisplay'] } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    signDisplay: options.signDisplay ?? 'auto',
  }).format(amountMajor);
}

export function formatPercent(fraction: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(fraction);
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export type DayBucket = 'today' | 'yesterday' | 'other';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which heading a transaction falls under, based on the viewer's local calendar day. */
export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return 'other';
}

/** Stable key for grouping by local calendar day, e.g. "2026-03-01". */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parses what a user typed into an amount field ("12", "12.5", "12,50", " 1 200.00 ") to minor
 * units. Returns null for anything that is not a positive amount with at most two decimals.
 */
export function parseAmountToMinor(input: string): number | null {
  const normalised = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;

  const [whole, fraction = ''] = normalised.split('.');
  const minor = Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
