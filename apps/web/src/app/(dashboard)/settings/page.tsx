"use client";

import { useTranslations } from 'next-intl';
import { PageShell } from '@/components/ui/PageShell';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Languages, User, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchCurrentUser } from '@/lib/api';
import { SecuritySettings } from '@/components/security/SecuritySettings';

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentLang, setCurrentLang] = useState('en');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    setMounted(true);
    const match = document.cookie.match(new RegExp('(^| )NEXT_LOCALE=([^;]+)'));
    if (match) setCurrentLang(match[2]);
    
    const storedName = localStorage.getItem('vaultcore_user_name');
    if (storedName) setUserName(storedName);

    fetchCurrentUser()
      .then(({ user }) => {
        setUserName(user.full_name);
        setEmail(user.email);
      })
      .catch(() => {});
  }, []);

  const handleLanguageChange = (locale: string) => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
    setCurrentLang(locale);
    window.location.reload();
  };

  if (!mounted) return null;

  return (
    <PageShell title={t('title')} subtitle="Manage your VaultCore preferences">
      <div className="space-y-8">
        
        {/* Profile Details */}
        <section className="space-y-6">
          <div className="flex items-center space-x-4 border-b border-[var(--border-subtle)] pb-4">
            <User className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-serif text-sm tracking-widest uppercase text-[var(--text-main)]">Profile Details</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Legal Full Name</label>
              <input 
                type="text" 
                disabled 
                value={userName || "Premium Client"} 
                className="input-premium w-full p-4 rounded-xl opacity-70 bg-transparent border border-[var(--border-subtle)] text-[var(--text-main)] cursor-not-allowed" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Primary Email</label>
              <input 
                type="email" 
                disabled 
                value={email} 
                className="input-premium w-full p-4 rounded-xl opacity-70 bg-transparent border border-[var(--border-subtle)] text-[var(--text-main)] cursor-not-allowed tabular-nums" 
              />
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-6">
          <div className="flex items-center space-x-4 border-b border-[var(--border-subtle)] pb-4">
            <Moon className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-serif text-sm tracking-widest uppercase text-[var(--text-main)]">{t('appearance')}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: 'light', label: t('light'), icon: Sun },
              { id: 'dark', label: t('dark'), icon: Moon },
              { id: 'system', label: t('system'), icon: Monitor }
            ].map((option) => {
              const isActive = theme === option.id;
              return (
                <button 
                  key={option.id}
                  onClick={() => setTheme(option.id)}
                  className={`relative flex items-center p-5 rounded-xl border transition-all duration-500 overflow-hidden group ${
                    isActive 
                      ? 'border-[#D4AF37] bg-[var(--bg-surface)]' 
                      : 'border-[var(--border-subtle)] bg-transparent hover:border-[#D4AF37]/40 hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors duration-500 ${isActive ? 'border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/5' : 'border-[var(--border-subtle)] text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>
                    <option.icon className="w-4 h-4" />
                  </div>
                  <span className={`ml-4 font-serif text-xs tracking-widest uppercase transition-colors duration-500 ${isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>
                    {option.label}
                  </span>
                  {isActive && (
                    <div className="absolute right-5 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Language */}
        <section className="space-y-6">
          <div className="flex items-center space-x-4 border-b border-[var(--border-subtle)] pb-4">
            <Languages className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-serif text-sm tracking-widest uppercase text-[var(--text-main)]">{t('language')}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: 'en', label: 'English' },
              { id: 'ru', label: 'Русский' },
              { id: 'de', label: 'Deutsch' },
              { id: 'pl', label: 'Polski' }
            ].map((option) => {
              const isActive = currentLang === option.id;
              return (
                <button 
                  key={option.id}
                  onClick={() => handleLanguageChange(option.id)}
                  className={`relative flex items-center p-5 rounded-xl border transition-all duration-500 group ${
                    isActive 
                      ? 'border-[#D4AF37] bg-[var(--bg-surface)]' 
                      : 'border-[var(--border-subtle)] bg-transparent hover:border-[#D4AF37]/40 hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <span className={`font-serif text-xs tracking-widest uppercase transition-colors duration-500 ${isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>
                    {option.label}
                  </span>
                  {isActive && (
                    <div className="absolute right-5 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>


        {/* Security */}
        <SecuritySettings />

      </div>
    </PageShell>
  );
}
