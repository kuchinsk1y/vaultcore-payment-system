"use client";

import { useCallback, useEffect, useState } from 'react';
import { Activity, KeyRound, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { fetchCurrentUser, type UserProfile } from '@/lib/api';
import { AuditLogList } from './AuditLogList';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SessionsList } from './SessionsList';
import { TwoFactorSection } from './TwoFactorSection';

function Section({ icon: Icon, title, children }: { icon: typeof KeyRound; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <div className="flex items-center space-x-4 border-b border-[var(--border-subtle)] pb-4">
        <Icon className="w-5 h-5 text-[#D4AF37]" aria-hidden />
        <h2 className="font-serif text-sm tracking-widest uppercase text-[var(--text-main)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function SecuritySettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then(({ user }) => !cancelled && setProfile(user))
      .catch(() => {
        /* fetchApi already redirects to the login page when the session is gone */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className="space-y-12">
      <Section icon={KeyRound} title="Password">
        <ChangePasswordForm />
        <p className="text-xs text-[var(--text-muted)]">Changing your password signs out all your other devices.</p>
      </Section>

      <Section icon={ShieldCheck} title="Two-Factor Authentication">
        {profile ? (
          <TwoFactorSection enabled={profile.two_factor_enabled} onChange={reload} />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Loading...</p>
        )}
      </Section>

      <Section icon={MonitorSmartphone} title="Active Sessions">
        <SessionsList />
      </Section>

      <Section icon={Activity} title="Recent Security Activity">
        <AuditLogList />
      </Section>
    </div>
  );
}
