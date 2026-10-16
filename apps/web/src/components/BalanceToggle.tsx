"use client";

import { Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function BalanceToggle() {
  const isBalanceVisible = useAppStore((state) => state.isBalanceVisible);
  const toggle = useAppStore((state) => state.toggleBalanceVisibility);

  return (
    <button 
      onClick={toggle}
      className="p-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition-all focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
      title={isBalanceVisible ? "Hide balances" : "Show balances"}
    >
      {isBalanceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </button>
  );
}
