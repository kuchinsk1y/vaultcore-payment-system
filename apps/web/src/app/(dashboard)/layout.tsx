"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { LayoutDashboard, ArrowRightLeft, CreditCard, Settings, LogOut, Moon, Sun, ListOrdered, Repeat } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { MobileBottomBar } from '@/components/MobileBottomBar';
import { fetchCurrentUser, logout, type UserProfile } from '@/lib/api';
import { EmailVerificationBanner } from '@/components/security/EmailVerificationBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('Navigation');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const init = async () => {
      const cachedName = localStorage.getItem('vaultcore_user_name');
      if (cachedName) setUserName(cachedName);

      // The session lives in an httpOnly cookie, so ask the API who we are
      try {
        const { user } = await fetchCurrentUser();
        setUserName(user.full_name);
        setProfile(user);
        localStorage.setItem('vaultcore_user_name', user.full_name);
        setIsAuthenticated(true);
      } catch {
        router.push('/login');
      }
    };
    init();
  }, [router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="animate-pulse flex flex-col items-center">
          <span className="font-serif text-3xl font-medium tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#B38F2B]">
            VaultCore
          </span>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const navItems = [
    { name: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('transactions'), href: '/transactions', icon: ListOrdered },
    { name: t('transfers'), href: '/transfers', icon: ArrowRightLeft },
    { name: t('cards'), href: '/cards', icon: CreditCard },
    { name: t('exchange'), href: '/exchange', icon: Repeat },
    { name: t('settings'), href: '/settings', icon: Settings },
  ];

  // Map pathname to Page Title
  const getPageTitle = () => {
    const matched = navItems.find(i => pathname === i.href || pathname.startsWith(`${i.href}/`));
    return matched ? matched.name : 'VaultCore';
  };

  return (
    <div className="h-screen overflow-hidden text-[var(--text-main)] flex bg-[var(--bg-main)]">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-main)] z-10 shrink-0 relative">
        <div className="h-24 flex items-center px-8">
          <span className="font-serif text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-[#D4AF37] to-[#B38F2B]">
            VaultCore
          </span>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-4 px-4 py-3 group transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] relative`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-1/2 bg-[#D4AF37]"></div>
                )}
                <item.icon className={`w-4 h-4 transition-colors duration-700 ${isActive ? 'text-[#D4AF37]' : 'text-gray-600 group-hover:text-gray-400'}`} />
                <span className={`font-serif text-xs tracking-[0.15em] uppercase transition-colors duration-700 ${isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-8 border-t border-[var(--border-subtle)] space-y-6">
          <div className="flex flex-col mb-4">
            <span className="font-serif text-sm tracking-widest text-[var(--text-main)] uppercase truncate" title={userName || 'Premium Client'}>{userName || 'Premium Client'}</span>
            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.2em] mt-1">Private Wealth</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex justify-center items-center gap-2 w-full py-3 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[#D4AF37] hover:border-[#D4AF37]/30 hover:bg-[#D4AF37]/5 transition-all duration-500"
            title={t('logout')}
          >
            <LogOut className="w-4 h-4" />
            <span className="font-serif text-[10px] uppercase tracking-widest">{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Column (Header + Content) */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Unified Top Header */}
        <header className="h-20 md:h-24 px-6 md:px-12 lg:px-16 border-b border-[var(--border-subtle)] bg-[var(--bg-main)]/80 backdrop-blur-xl z-20 shrink-0 relative transition-colors duration-700 flex items-center justify-between">
            {/* Left: Mobile Logo or Desktop Page Title */}
          <div className="flex items-center">
            <div className="md:hidden">
              <span className="font-serif text-lg font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-[#D4AF37] to-[#B38F2B]">
                VaultCore
              </span>
            </div>
            <div className="hidden md:block">
              <h1 className="font-serif text-lg tracking-[0.15em] text-[var(--text-main)] uppercase transition-colors duration-700">
                {getPageTitle()}
              </h1>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center space-x-6">
            <LanguageSwitcher />
            
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-[var(--text-muted)] hover:text-[#D4AF37] transition-colors duration-500 flex items-center"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto pt-8 pb-28 md:pb-8 px-6 md:px-12 lg:px-16">
          <div className="w-full h-full">
            {profile && !profile.email_verified && <EmailVerificationBanner />}
            {children}
          </div>
        </main>

        <MobileBottomBar />
      </div>
    </div>
  );
}
