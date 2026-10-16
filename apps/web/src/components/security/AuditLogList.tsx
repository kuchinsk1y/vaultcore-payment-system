"use client";

import { useEffect, useState } from 'react';
import { ApiException, fetchAuditLog, type AuditEntry } from '@/lib/api';

const LABELS: Record<string, string> = {
  'auth.register': 'Account created',
  'auth.login.success': 'Signed in',
  'auth.login.failed': 'Failed sign-in attempt',
  'auth.login.locked': 'Account temporarily locked',
  'auth.logout': 'Signed out',
  'auth.logout_all': 'Signed out of all devices',
  'auth.session.revoked': 'Device signed out',
  'auth.refresh.reuse_detected': 'Suspicious session reuse blocked',
  'auth.email.verified': 'Email verified',
  'auth.password.reset_requested': 'Password reset requested',
  'auth.password.reset': 'Password reset',
  'auth.password.changed': 'Password changed',
  'auth.2fa.setup_started': 'Two-factor setup started',
  'auth.2fa.enabled': 'Two-factor turned on',
  'auth.2fa.disabled': 'Two-factor turned off',
  'auth.2fa.failed': 'Wrong authenticator code',
  'transfer.created': 'Transfer sent',
  'transfer.confirmation.requested': 'Transfer confirmation requested',
  'transfer.confirmation.failed': 'Wrong transfer confirmation code',
  'account.created': 'Account opened',
  'account.closed': 'Account closed',
  'card.issued': 'Card issued',
  'card.frozen': 'Card frozen',
  'card.unfrozen': 'Card unfrozen',
  'card.pin_changed': 'Card PIN changed',
  'contact.added': 'Contact added',
};

const WARNING_ACTIONS = new Set([
  'auth.login.failed',
  'auth.login.locked',
  'auth.refresh.reuse_detected',
  'auth.2fa.failed',
  'transfer.confirmation.failed',
]);

export const describeAction = (action: string) => LABELS[action] ?? action;

export function AuditLogList() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchAuditLog(30)
      .then((data) => !cancelled && setEntries(data))
      .catch((err) => !cancelled && setError(err instanceof ApiException ? err.message : 'Could not load activity.'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="text-sm text-red-500">{error}</p>;
  if (!entries) return <p className="text-sm text-[var(--text-muted)]">Loading activity...</p>;
  if (entries.length === 0) return <p className="text-sm text-[var(--text-muted)]">No activity yet.</p>;

  return (
    <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl max-h-96 overflow-y-auto">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className={`text-sm truncate ${WARNING_ACTIONS.has(entry.action) ? 'text-amber-500' : 'text-[var(--text-main)]'}`}>
              {describeAction(entry.action)}
            </p>
            <p className="text-xs text-[var(--text-muted)] truncate">{entry.ip ?? 'Unknown IP'}</p>
          </div>
          <time dateTime={entry.created_at} className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
            {new Date(entry.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </li>
      ))}
    </ul>
  );
}
