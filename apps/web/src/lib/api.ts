export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface ApiError {
  status: 'error';
  code: string;
  message: string;
}

export class ApiException extends Error {
  constructor(public code: string, public message: string, public status: number) {
    super(message);
    this.name = 'ApiException';
  }
}

function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('vaultcore_token');
  }
  return null;
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('vaultcore_token');
  }
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('vaultcore_token', token);
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
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
    
    if (response.status === 401) {
      clearToken();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
      throw new ApiException('UNAUTHORIZED', 'Session expired. Please log in again.', 401);
    }

    throw new ApiException(
      errorData?.code || 'UNKNOWN_ERROR',
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
}

export interface TransferResponse {
  id: string;
  source_account_id: string;
  destination_account_id: string;
  status: string;
}

export async function submitTransfer(payload: TransferRequest, idempotencyKey: string): Promise<TransferResponse> {
  return fetchApi<TransferResponse>('/transfers', {
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
  token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
  };
}

export async function loginUser(payload: any): Promise<AuthResponse> {
  return fetchApi<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function registerUser(payload: any): Promise<AuthResponse> {
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
