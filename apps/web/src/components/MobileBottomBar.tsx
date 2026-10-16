"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, CreditCard, ListOrdered, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function MobileBottomBar() {
  const pathname = usePathname();
  const t = useTranslations('Navigation');

  const navItems = [
    { name: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('transactions'), href: '/transactions', icon: ListOrdered },
    { name: 'center', href: '/transfers', icon: ArrowRightLeft }, // Center prominent button
    { name: t('cards'), href: '/cards', icon: CreditCard },
    { name: t('settings'), href: '/settings', icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-main)]/90 backdrop-blur-xl border-t border-[var(--border-subtle)] px-6 pb-safe pt-2">
      <div className="flex justify-between items-center h-16 relative">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          
          if (item.name === 'center') {
            return (
              <div key="center" className="relative -top-5 flex justify-center w-[20%]">
                <Link 
                  href={item.href}
                  className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-[#B38F2B] to-[#D4AF37] shadow-[0_4px_20px_rgba(212,175,55,0.4)] text-[#0A0A0B] transition-transform active:scale-95"
                >
                  <item.icon className="w-6 h-6" />
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center w-[20%] space-y-1 transition-colors ${
                isActive ? 'text-[#D4AF37]' : 'text-[var(--text-muted)]'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-[#D4AF37]' : ''}`} />
              <span className="text-[9px] uppercase tracking-widest font-serif truncate w-full text-center">
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
