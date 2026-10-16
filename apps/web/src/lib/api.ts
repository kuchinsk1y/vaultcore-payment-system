export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface ApiError {
  status?: string;
  code?: string;
  error?: string;
  message: string;
}

export class ApiException extends Error {
  constructor(public code: string, public message: string, public status: number) {
    super(message);
    this.name = 'ApiException';
  }
}

const USER_NAME_KEY = 'vaultcore_user_name';

// The session token lives in an httpOnly cookie set by the API and is never readable from JS.
// Only the non-sensitive display name is cached in localStorage.
export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_NAME_KEY);
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'same-origin' });
  } finally {
    clearSession();
  }
}

// Endpoints where a 401 means bad credentials or a bad token, not an expired session
const NO_REFRESH_PREFIXES = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/password/', '/auth/email/verify'];

let refreshInFlight: Promise<boolean> | null = null;

/** Gets a new access token using the httpOnly refresh cookie. Concurrent callers share one request. */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function redirectToLogin() {
  clearSession();
  if (typeof window !== 'undefined' && !['/login', '/register'].includes(window.location.pathname)) {
    window.location.href = '/login';
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (!response.ok) {
    let errorData: ApiError | undefined;
    try {
      errorData = await response.json();
    } catch {
      // Failed to parse JSON
    }

    if (response.status === 429) {
      throw new ApiException('TOO_MANY_REQUESTS', 'Rate limit exceeded. Please slow down and try again later.', 429);
    }

    if (response.status === 401 && !NO_REFRESH_PREFIXES.some((p) => endpoint.startsWith(p))) {
      // The short-lived access token probably expired: refresh it once and replay the request
      if (allowRefresh && (await refreshSession())) {
        return fetchApi<T>(endpoint, options, false);
      }
      redirectToLogin();
      throw new ApiException('UNAUTHORIZED', 'Session expired. Please log in again.', 401);
    }

    throw new ApiException(
      errorData?.code || errorData?.error || 'UNKNOWN_ERROR',
      errorData?.message || `HTTP Error ${response.status}`,
      response.status
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Specific Domain API Calls

export interface Account {
  id: string;
  user_id: string;
  currency: string;
  balance?: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  currency: string;
  description?: string;
  created_at: string;
}

export interface TransferRequest {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  currency: string;
  /** Required together for large transfers that need a one-time code. */
  confirmation_id?: string;
  confirmation_code?: string;
}

/** Returned (HTTP 202) when a large transfer needs a one-time code before it is executed. */
export interface TransferConfirmationRequired {
  status: 'CONFIRMATION_REQUIRED';
  confirmation_id: string;
  method: 'EMAIL_OTP' | 'TOTP';
  expires_at: string;
}

export const isConfirmationRequired = (
  result: TransferResponse | TransferConfirmationRequired,
): result is TransferConfirmationRequired => result.status === 'CONFIRMATION_REQUIRED';

export interface TransferResponse {
  id: string;
  source_account_id: string;
  destination_account_id: string;
  status: string;
}

export async function submitTransfer(
  payload: TransferRequest,
  idempotencyKey: string,
): Promise<TransferResponse | TransferConfirmationRequired> {
  return fetchApi<TransferResponse | TransferConfirmationRequired>('/transfers', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

// Auth API Calls

export interface AuthResponse {
  message: string;
  user: {
    id: string;
    email: string;
    full_name: string;
  };
}

export interface LoginPayload {
  email: string;
  password: string;
  /** 6-digit authenticator code, required when two-factor authentication is enabled. */
  totp_code?: string;
}

export interface RegisterPayload extends LoginPayload {
  first_name: string;
  last_name: string;
  phone_number: string;
  country: string;
  city?: string;
  zip_code?: string;
  street?: string;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  return fetchApi<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  return fetchApi<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Multi-Currency & FX API Calls

export interface FxRate {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: string;
  created_at: string;
}

export interface ConvertFxRequest {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
}

export interface ConvertFxResponse {
  status: string;
  source_amount: number;
  source_currency: string;
  rate: number;
  converted_amount: number;
  destination_currency: string;
  ledger_transaction_id: string;
}

export async function createAccount(currency: string): Promise<Account> {
  return fetchApi<Account>('/accounts', {
    method: 'POST',
    body: JSON.stringify({ currency })
  });
}

export async function fetchFxRates(): Promise<FxRate[]> {
  return fetchApi<FxRate[]>('/fx/rates');
}

export async function convertFx(payload: ConvertFxRequest): Promise<ConvertFxResponse> {
  return fetchApi<ConvertFxResponse>('/fx/convert', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Analytics API Calls

export interface CategoryBreakdown {
  category: string;
  amount: number;
}

export interface AnalyticsSummary {
  base_currency: string;
  total_income: number;
  total_expenses: number;
  categories: CategoryBreakdown[];
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  return fetchApi<AnalyticsSummary>('/analytics/summary');
}

// Cards API Calls

export interface Card {
  id: string;
  user_id: string;
  account_id: string;
  card_type: 'VIRTUAL' | 'PHYSICAL';
  last_four: string;
  status: 'ACTIVE' | 'FROZEN' | 'BLOCKED';
  spending_limit: number;
  created_at: string;
}

export async function fetchCards(): Promise<{status: string, data: Card[]}> {
  return fetchApi<{status: string, data: Card[]}>('/cards');
}

export async function issueCard(account_id: string, spending_limit?: number): Promise<{status: string, data: Card}> {
  return fetchApi<{status: string, data: Card}>('/cards', {
    method: 'POST',
    body: JSON.stringify({ account_id, spending_limit })
  });
}

export async function freezeCard(cardId: string): Promise<{status: string, data: Card}> {
  return fetchApi<{status: string, data: Card}>(`/cards/${cardId}/freeze`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function unfreezeCard(cardId: string): Promise<{status: string, data: Card}> {
  return fetchApi<{status: string, data: Card}>(`/cards/${cardId}/unfreeze`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
}

export async function fetchCurrentUser(): Promise<{ user: UserProfile }> {
  return fetchApi('/auth/me');
}

// Account security

export interface SessionInfo {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const post = <T = { message: string }>(endpoint: string, body?: unknown) =>
  fetchApi<T>(endpoint, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const verifyEmail = (token: string) => post('/auth/email/verify', { token });
export const resendVerificationEmail = () => post('/auth/email/resend');
export const requestPasswordReset = (email: string) => post('/auth/password/forgot', { email });
export const resetPassword = (token: string, password: string) => post('/auth/password/reset', { token, password });
export const changePassword = (current_password: string, new_password: string) =>
  post('/auth/password/change', { current_password, new_password });

export const beginTwoFactorSetup = () => post<{ secret: string; otpauth_uri: string }>('/auth/2fa/setup');
export const enableTwoFactor = (code: string) => post('/auth/2fa/enable', { code });
export const disableTwoFactor = (password: string, code: string) => post('/auth/2fa/disable', { password, code });

export const fetchSessions = async () => (await fetchApi<{ sessions: SessionInfo[] }>('/auth/sessions')).sessions;
export const revokeSession = (id: string) => fetchApi<{ message: string }>(`/auth/sessions/${id}`, { method: 'DELETE' });
export const logoutEverywhere = () => post('/auth/logout-all');
export const fetchAuditLog = async (limit = 50) =>
  (await fetchApi<{ entries: AuditEntry[] }>(`/auth/audit-log?limit=${limit}`)).entries;

// Accounts, contacts, cards, analytics

export interface AccountSummary {
  id: string;
  currency: string;
  balance: number;
  status?: string;
}

export interface ContactAccount {
  account_id: string;
  currency: string;
}

export interface Contact {
  contact_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone_number: string;
  accounts: ContactAccount[];
}

export interface ContactSearchResult {
  user: { id: string; full_name: string };
}

export interface PortfolioItem {
  date: string;
  balance: number;
}

export const fetchAccounts = () => fetchApi<AccountSummary[]>('/accounts');

export const fetchContacts = () => fetchApi<Contact[]>('/contacts');

export const searchContactByPhone = (phone_number: string) =>
  fetchApi<ContactSearchResult>('/contacts/search', { method: 'POST', body: JSON.stringify({ phone_number }) });

export const addContact = (contact_user_id: string) =>
  fetchApi<unknown>('/contacts', { method: 'POST', body: JSON.stringify({ contact_user_id }) });

export const setCardPin = (cardId: string, pin: string) =>
  fetchApi<unknown>(`/cards/${cardId}/pin`, { method: 'POST', body: JSON.stringify({ pin }) });

export const fetchLedger = <T>(accountId: string) => fetchApi<T>(`/accounts/${accountId}/ledger`);

export async function fetchPortfolio(): Promise<PortfolioItem[]> {
  const res = await fetchApi<{ status: string; data: PortfolioItem[] }>('/analytics/portfolio');
  return res.status === 'success' ? res.data : [];
}

// Transactions

export type TransactionKind = 'TRANSFER' | 'EXCHANGE' | 'TOP_UP' | 'DEPOSIT' | 'OTHER';

export interface Transaction {
  id: string;
  transaction_id: string;
  date: string;
  kind: TransactionKind;
  direction: 'CREDIT' | 'DEBIT';
  /** Always positive, in minor units (cents); the sign comes from `direction`. */
  amount_minor: number;
  currency: string;
  description: string | null;
  account_id: string;
  counterparty: { name: string; account_id: string; is_self: boolean } | null;
}

export interface TransactionFilters {
  account_id?: string;
  direction?: 'CREDIT' | 'DEBIT';
  kind?: TransactionKind;
  from?: string;
  to?: string;
  q?: string;
}

export interface TransactionPage {
  items: Transaction[];
  next_cursor: string | null;
}

/** Builds a query string, skipping empty values. */
export function toQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const fetchTransactions = (params: TransactionFilters & { limit?: number; cursor?: string | null } = {}) =>
  fetchApi<TransactionPage>(`/transactions${toQuery(params)}`);

/** Same-origin URL that downloads the filtered history as CSV (the session cookie authenticates it). */
export const transactionsExportUrl = (filters: TransactionFilters = {}) =>
  `${API_URL}/transactions/export${toQuery(filters)}`;

// Accounts: options and demo top-up

export interface AccountOptions {
  currencies: string[];
  top_up: { enabled: boolean; max_per_request: number; max_per_24h: number };
}

export interface TopUpResult {
  transaction_id: string;
  account_id: string;
  amount_minor: number;
  currency: string;
  remaining_24h: number;
}

export const fetchAccountOptions = () => fetchApi<AccountOptions>('/accounts/options');

export const topUpAccount = (accountId: string, amountMinor: number) =>
  fetchApi<TopUpResult>(`/accounts/${accountId}/top-up`, { method: 'POST', body: JSON.stringify({ amount: amountMinor }) });
