"use client";

import { useCallback, useEffect, useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { ApiException, fetchSessions, logoutEverywhere, revokeSession, type SessionInfo } from '@/lib/api';

/** Turns a raw user-agent string into something readable, e.g. "Chrome on Windows". */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser =
    (/Edg\//.test(userAgent) && 'Edge') ||
    (/OPR\/|Opera/.test(userAgent) && 'Opera') ||
    (/Firefox\//.test(userAgent) && 'Firefox') ||
    (/Chrome\//.test(userAgent) && 'Chrome') ||
    (/Safari\//.test(userAgent) && 'Safari') ||
    null;
  const os =
    (/Windows/.test(userAgent) && 'Windows') ||
    (/Android/.test(userAgent) && 'Android') ||
    (/iPhone|iPad|iOS/.test(userAgent) && 'iOS') ||
    (/Mac OS X|Macintosh/.test(userAgent) && 'macOS') ||
    (/Linux/.test(userAgent) && 'Linux') ||
    null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown device';
}

const isMobile = (ua: string | null) => !!ua && /Android|iPhone|iPad|Mobile/.test(ua);
const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function SessionsList() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((data) => !cancelled && setSessions(data))
      .catch((err) => !cancelled && setError(err instanceof ApiException ? err.message : 'Could not load sessions.'));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const revoke = async (id: string) => {
    try {
      await revokeSession(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not sign out that device.');
    }
  };

  const signOutEverywhere = async () => {
    if (!window.confirm('Sign out of every device, including this one?')) return;
    try {
      await logoutEverywhere();
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not sign out.');
    }
  };

  if (!sessions && !error) return <p className="text-sm text-[var(--text-muted)]">Loading sessions...</p>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl">
        {sessions?.map((s) => {
          const Icon = isMobile(s.user_agent) ? Smartphone : Laptop;
          return (
            <li key={s.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-4 min-w-0">
                <Icon className="w-5 h-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text-main)] truncate">
                    {describeDevice(s.user_agent)}
                    {s.current && <span className="ml-2 text-[10px] uppercase tracking-widest text-emerald-500">This device</span>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {s.ip ?? 'Unknown IP'} · last active {formatDate(s.last_used_at)}
                  </p>
                </div>
              </div>
              {!s.current && (
                <button onClick={() => revoke(s.id)} className="shrink-0 text-xs uppercase tracking-widest text-red-500 hover:text-red-400">
                  Sign out
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button onClick={signOutEverywhere} className="text-xs uppercase tracking-widest text-red-500 hover:text-red-400">
        Sign out everywhere
      </button>
    </div>
  );
}
