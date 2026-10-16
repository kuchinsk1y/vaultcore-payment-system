import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiException, fetchApi, logout } from './api';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

describe('fetchApi', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends cookies and a JSON content type only when there is a body', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

    await fetchApi('/ping');
    await fetchApi('/echo', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    const [, getInit] = fetchMock.mock.calls[0];
    const [, postInit] = fetchMock.mock.calls[1];
    expect(getInit.credentials).toBe('same-origin');
    expect(getInit.headers['Content-Type']).toBeUndefined();
    expect(postInit.headers['Content-Type']).toBe('application/json');
  });

  it('never attaches an Authorization header (the session is an httpOnly cookie)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await fetchApi('/ping');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('maps API errors to ApiException', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'BAD', message: 'Nope' }, { status: 400 }));

    await expect(fetchApi('/x')).rejects.toMatchObject({ name: 'ApiException', code: 'BAD', message: 'Nope', status: 400 });
  });

  it('reports rate limiting', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 429 }));
    await expect(fetchApi('/x')).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS', status: 429 });
  });

  it('clears the cached user name on 401', async () => {
    localStorage.setItem('vaultcore_user_name', 'Ada');
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 401 }));

    // Already on /login in jsdom? No: avoid a real navigation by pretending to be on the login page
    window.history.pushState({}, '', '/login');

    await expect(fetchApi('/x')).rejects.toBeInstanceOf(ApiException);
    expect(localStorage.getItem('vaultcore_user_name')).toBeNull();
  });

  it('returns an empty object for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(fetchApi('/x')).resolves.toEqual({});
  });
});

describe('fetchApi session refresh', () => {
  const fetchMock = vi.fn();
  const urlOf = (call: unknown[]) => String(call[0]);

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    window.history.pushState({}, '', '/login'); // avoid real navigations on redirect
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('refreshes the session once on 401 and replays the request', async () => {
    let dataCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return jsonResponse({ message: 'ok' });
      dataCalls += 1;
      return dataCalls === 1 ? jsonResponse({}, { status: 401 }) : jsonResponse({ value: 42 });
    });

    await expect(fetchApi('/accounts')).resolves.toEqual({ value: 42 });
    expect(fetchMock.mock.calls.map(urlOf)).toEqual(['/api/accounts', '/api/auth/refresh', '/api/accounts']);
  });

  it('gives up and reports an expired session when the refresh fails', async () => {
    localStorage.setItem('vaultcore_user_name', 'Ada');
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? jsonResponse({}, { status: 401 }) : jsonResponse({}, { status: 401 }),
    );

    await expect(fetchApi('/accounts')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(localStorage.getItem('vaultcore_user_name')).toBeNull();
    // one original request + one refresh attempt, no replay
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not loop: a replayed request that is still 401 is not refreshed again', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? jsonResponse({ message: 'ok' }) : jsonResponse({}, { status: 401 }),
    );

    await expect(fetchApi('/accounts')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fetchMock.mock.calls.map(urlOf)).toEqual(['/api/accounts', '/api/auth/refresh', '/api/accounts']);
  });

  it('shares one refresh between concurrent requests', async () => {
    const attempts = new Map<string, number>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return jsonResponse({ message: 'ok' });
      const n = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, n);
      return n === 1 ? jsonResponse({}, { status: 401 }) : jsonResponse({ url });
    });

    await Promise.all([fetchApi('/a'), fetchApi('/b'), fetchApi('/c')]);

    expect(fetchMock.mock.calls.filter((c) => urlOf(c).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it.each(['/auth/login', '/auth/register', '/auth/password/reset'])(
    'does not try to refresh on a 401 from %s (bad credentials, not an expired session)',
    async (endpoint) => {
      fetchMock.mockImplementation(async () => jsonResponse({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }, { status: 401 }));

      await expect(fetchApi(endpoint, { method: 'POST', body: '{}' })).rejects.toMatchObject({
        message: 'Invalid credentials',
        status: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('surfaces the error code from the API (code or error field)', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'ACCOUNT_LOCKED', message: 'Locked' }, { status: 423 }));
    await expect(fetchApi('/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', status: 423 });
  });
});

describe('logout', () => {
  it('calls the API and clears the cached user name even if the request fails', async () => {
    localStorage.setItem('vaultcore_user_name', 'Ada');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(logout()).rejects.toThrow('offline');
    expect(localStorage.getItem('vaultcore_user_name')).toBeNull();

    vi.unstubAllGlobals();
  });
});
