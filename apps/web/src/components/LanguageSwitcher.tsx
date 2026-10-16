'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pl', label: 'Polski' },
];

export function LanguageSwitcher() {
  const router = useRouter();
  const [lang, setLang] = useState('en');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read current locale from cookie if available
    const match = document.cookie.match(new RegExp('(^| )NEXT_LOCALE=([^;]+)'));
    if (match) {
      setLang(match[2]);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (newLang: string) => {
    document.cookie = `NEXT_LOCALE=${newLang}; path=/; max-age=31536000`;
    setLang(newLang);
    setIsOpen(false);
    router.refresh();
  };

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center space-x-2 text-[11px] font-serif tracking-[0.15em] uppercase text-[var(--text-muted)] hover:text-[#D4AF37] transition-colors duration-500 py-2 group"
        title="Switch Language"
      >
        <Globe className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
        <span className="pt-[1px]">{currentLang.code}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Premium Dropdown */}
      <div className={`absolute top-full right-0 mt-4 w-48 surface-premium rounded-xl shadow-2xl overflow-hidden transition-all duration-500 origin-top-right z-50 ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
        <div className="p-2 space-y-1 bg-[var(--bg-surface)]/80 backdrop-blur-md border border-[var(--border-subtle)] rounded-xl">
          {LANGUAGES.map((l) => {
            const isActive = l.code === lang;
            return (
              <button
                key={l.code}
                onClick={() => changeLanguage(l.code)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-300 ${
                  isActive 
                    ? 'bg-[#D4AF37]/10 text-[var(--text-main)] border border-[#D4AF37]/20' 
                    : 'hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={`font-serif text-[11px] tracking-widest uppercase pt-[1px] ${isActive ? 'text-[var(--text-main)]' : ''}`}>{l.label}</span>
                </div>
                {isActive && <Check className="w-3 h-3 text-[#D4AF37]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
