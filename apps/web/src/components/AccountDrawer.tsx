"use client";

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Search, Filter, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAppStore } from '../store/useAppStore';
import { fetchLedger } from '@/lib/api';

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  direction: 'CREDIT' | 'DEBIT';
  counterparty_name: string | null;
  counterparty_account: string | null;
}

interface AccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  account: {
    id: string;
    currency: string;
    balance: number;
  } | null;
}

export function AccountDrawer({ isOpen, onClose, account }: AccountDrawerProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const isBalanceVisible = useAppStore(state => state.isBalanceVisible);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'24H' | '30D' | '12M' | 'ALL'>('ALL');

  const accountId = account?.id;

  useEffect(() => {
    if (!isOpen || !accountId) return;

    let cancelled = false;
    setLoading(true);
    fetchLedger<LedgerEntry[]>(accountId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, accountId]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // 1. Search Filter
      const term = search.toLowerCase();
      const matchesSearch = 
        (entry.description || '').toLowerCase().includes(term) ||
        (entry.counterparty_name || '').toLowerCase().includes(term);
      if (!matchesSearch) return false;

      // 2. Type Filter
      if (typeFilter !== 'ALL' && entry.direction !== typeFilter) return false;

      // 3. Period Filter
      if (periodFilter !== 'ALL') {
        const entryDate = new Date(entry.date).getTime();
        const now = Date.now();
        const diffHours = (now - entryDate) / (1000 * 60 * 60);
        
        if (periodFilter === '24H' && diffHours > 24) return false;
        if (periodFilter === '30D' && diffHours > 24 * 30) return false;
        if (periodFilter === '12M' && diffHours > 24 * 365) return false;
      }

      return true;
    });
  }, [entries, search, typeFilter, periodFilter]);

  const exportPDF = () => {
    if (!account) return;

    const doc = new jsPDF();
    
    // Add Premium Header
    doc.setFillColor(212, 175, 55); // #D4AF37 Gold
    doc.rect(0, 0, 210, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('VaultCore Statement', 14, 20);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`Account ID: ${account.id}`, 14, 40);
    doc.text(`Currency: ${account.currency}`, 14, 48);
    doc.text(`Current Balance: ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${account.currency}`, 14, 56);
    doc.text(`Date Generated: ${new Date().toLocaleString()}`, 14, 64);

    // Table
    const tableData = filteredEntries.map(e => [
      new Date(e.date).toLocaleDateString(),
      e.description || 'Transfer',
      e.counterparty_name || '-',
      e.direction === 'CREDIT' ? 'IN' : 'OUT',
      `${e.direction === 'CREDIT' ? '+' : '-'}${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${e.currency}`
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['Date', 'Description', 'Counterparty', 'Type', 'Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [212, 175, 55] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      styles: { font: 'helvetica', fontSize: 9 }
    });

    doc.save(`VaultCore_Statement_${account.id.slice(0, 8)}.pdf`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-[var(--bg-main)] border-l border-[var(--border-subtle)] shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-[var(--border-subtle)] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <div className="w-32 h-32 rounded-full border-4 border-[#D4AF37]" />
              </div>
              <button onClick={onClose} className="absolute top-5 right-5 text-gray-500 hover:text-[#D4AF37] transition-colors">
                <X className="w-5 h-5" />
              </button>
              
              <h2 className="text-xs tracking-widest text-[#D4AF37] uppercase mb-4">Account Details</h2>
              <div className="space-y-1">
                <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider">{account?.id}</p>
                <div className="flex items-end space-x-2">
                  <h3 className="font-serif text-4xl tracking-tight text-[var(--text-main)]">
                    {isBalanceVisible ? (
                      `${account?.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    ) : (
                      '****'
                    )}
                  </h3>
                  <span className="text-lg text-[var(--text-muted)] pb-1">{account?.currency}</span>
                </div>
              </div>

              <div className="mt-8 flex space-x-4">
                <button 
                  onClick={() => window.location.href = '/transfers'} 
                  className="flex-1 btn-gold py-3 text-xs tracking-widest uppercase flex items-center justify-center space-x-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Send</span>
                </button>
                <button 
                  onClick={exportPDF}
                  className="flex-1 btn-luxury py-3 text-xs tracking-widest uppercase flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Statement</span>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="p-3 border-b border-[var(--border-subtle)] bg-white/[0.01]">
              <div className="flex space-x-2 mb-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search by name or desc..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-transparent border border-[var(--border-subtle)] rounded-sm py-2 pl-8 pr-3 text-xs focus:outline-none focus:border-[#D4AF37]/50"
                  />
                </div>
                <select 
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value as 'ALL' | 'CREDIT' | 'DEBIT')}
                  className="bg-transparent border border-[var(--border-subtle)] rounded-sm py-2 px-3 text-xs text-[var(--text-main)] focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="ALL">All Types</option>
                  <option value="CREDIT">In (Credit)</option>
                  <option value="DEBIT">Out (Debit)</option>
                </select>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                <Filter className="w-3 h-3 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)] tracking-wider uppercase" style={{fontSize: '9px'}}>Period:</span>
                <div className="flex space-x-1">
                  {(['24H', '30D', '12M', 'ALL'] as const).map(p => (
                    <button 
                      key={p}
                      onClick={() => setPeriodFilter(p)}
                      className={`px-2 py-1 rounded-sm text-[9px] tracking-wider uppercase transition-colors ${periodFilter === p ? 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Transaction List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 font-serif">
              {loading ? (
                <div className="animate-pulse space-y-3">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 bg-white/[0.02] rounded-sm" />
                  ))}
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
                  <Calendar className="w-8 h-8 mb-4 text-[#D4AF37]" />
                  <p className="text-xs text-[var(--text-main)]">No transactions found</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2">Adjust your filters to see more results.</p>
                </div>
              ) : (
                filteredEntries.map(entry => (
                  <div key={entry.id} className="p-3 border border-[var(--border-subtle)] hover:border-[#D4AF37]/30 transition-colors rounded-sm flex items-center justify-between group">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${entry.direction === 'CREDIT' ? 'bg-green-500/10 text-green-500' : 'bg-[var(--border-subtle)] text-[var(--text-main)]'}`}>
                        {entry.direction === 'CREDIT' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[var(--text-main)] truncate max-w-[150px]">{entry.counterparty_name || entry.description || 'Transfer'}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{new Date(entry.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-serif ${entry.direction === 'CREDIT' ? 'text-green-500' : 'text-[var(--text-main)]'}`}>
                        {isBalanceVisible ? (
                          <>
                            {entry.direction === 'CREDIT' ? '+' : '-'}
                            {entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </>
                        ) : (
                          '****'
                        )}
                      </p>
                      <p className="text-[9px] font-mono text-[var(--text-muted)]">{entry.currency}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
