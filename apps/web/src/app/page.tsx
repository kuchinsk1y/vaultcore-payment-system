'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi, submitTransfer, ApiException, Account, LedgerEntry, fetchFxRates, FxRate, convertFx, createAccount, fetchAnalytics, AnalyticsSummary, Card, fetchCards, issueCard, freezeCard, unfreezeCard } from '@/lib/api';
import { Activity, Plus, Shield, Check, Info, ArrowRight, Loader2, Lock } from 'lucide-react'; // CreditCard, Unlock, ArrowUpRight, ArrowDownRight, 
import Sidebar from '@/components/Sidebar';
import CardManagementDrawer from '@/components/CardManagementDrawer';

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  PLN: 'zł',
};

// Physics-based spring config
const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const fadeUpItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: springTransition }
};

export default function Dashboard() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rates, setRates] = useState<FxRate[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [cards, setCards] = useState<Card[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Widget Tabs
  const [activeTab, setActiveTab] = useState<'transfer' | 'fx'>('transfer');

  // Transfer form state
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferStatus, setTransferStatus] = useState<{ type: 'success' | 'error' | 'pending', message: string } | null>(null);

  // FX form state
  const [fxSourceId, setFxSourceId] = useState('');
  const [fxDestId, setFxDestId] = useState('');
  const [fxAmount, setFxAmount] = useState('');
  const [fxStatus, setFxStatus] = useState<{ type: 'success' | 'error' | 'pending', message: string } | null>(null);

  // Account creation state
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [newAccountCurrency, setNewAccountCurrency] = useState('USD');

  // Card Issue State
  const [isIssuingCard, setIsIssuingCard] = useState(false);


  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [accs, fxRates, analyticsData, cardsData] = await Promise.all([
        fetchApi<Account[]>('/accounts', {}),
        fetchFxRates(),
        fetchAnalytics().catch(() => null),
        fetchCards().catch(() => ({ status: 'error', data: [] }))
      ]);

      setAccounts(accs);
      setRates(fxRates);
      if (analyticsData) setAnalytics(analyticsData);
      if (cardsData.status === 'success') setCards(cardsData.data);

      if (accs.length >= 1) {
        if (!sourceAccountId) setSourceAccountId(accs[0].id);
        if (!fxSourceId) setFxSourceId(accs[0].id);
      }
      if (accs.length >= 2) {
        if (!destinationAccountId) setDestinationAccountId(accs[1].id);
        if (!fxDestId) setFxDestId(accs[1].id);
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError('Failed to fetch data');
      }
    } finally {
      setIsLoading(false);
    }
  }, [sourceAccountId, destinationAccountId, fxSourceId, fxDestId]);

  useEffect(() => {
    const token = localStorage.getItem('vaultcore_token');
    if (!token) {
      router.push('/login');
    } else {
      const init = async () => {
        await fetchData();
      };
      init();
    }
  }, [fetchData, router]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceAccountId || !destinationAccountId || !amount) return;

    setTransferStatus({ type: 'pending', message: 'Processing transfer...' });

    try {
      const idempotencyKey = crypto.randomUUID();
      const acc = accounts.find(a => a.id === sourceAccountId);
      if (!acc) throw new Error("Invalid source account");

      await submitTransfer({
        source_account_id: sourceAccountId,
        destination_account_id: destinationAccountId,
        amount: Math.floor(parseFloat(amount) * 100),
        currency: acc.currency
      }, idempotencyKey);

      setTransferStatus({ type: 'success', message: 'Transfer completed successfully' });

      setLedgerEntries(prev => [{
        id: crypto.randomUUID(),
        account_id: sourceAccountId,
        amount: parseFloat(amount) * 100,
        direction: 'DEBIT',
        currency: acc.currency,
        created_at: new Date().toISOString()
      }, ...prev]);

      setAmount('');
      fetchData();
      setTimeout(() => setTransferStatus(null), 3000);
    } catch (err) {
      setTransferStatus({ type: 'error', message: err instanceof ApiException ? err.message : 'Error' });
      setTimeout(() => setTransferStatus(null), 4000);
    }
  };

  const handleFx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fxSourceId || !fxDestId || !fxAmount) return;

    setFxStatus({ type: 'pending', message: 'Exchanging funds...' });

    try {
      await convertFx({
        source_account_id: fxSourceId,
        destination_account_id: fxDestId,
        amount: Math.floor(parseFloat(fxAmount) * 100)
      });

      setFxStatus({ type: 'success', message: 'Exchange completed successfully' });
      setFxAmount('');
      fetchData();
      setTimeout(() => setFxStatus(null), 3000);
    } catch (err) {
      setFxStatus({ type: 'error', message: err instanceof ApiException ? err.message : 'Error' });
      setTimeout(() => setFxStatus(null), 4000);
    }
  };

  const handleCreateAccount = async () => {
    setIsCreatingAccount(true);
    try {
      await createAccount(newAccountCurrency);
      await fetchData();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Failed to create account');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleIssueCard = async (accountId: string) => {
    setIsIssuingCard(true);
    try {
      await issueCard(accountId);
      await fetchData();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Failed to issue card');
    } finally {
      setIsIssuingCard(false);
    }
  };

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const handleToggleCardStatus = async (card: Card) => {
    // This is now handled within the modal, but kept here for backward compatibility or if called directly
    try {
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: card.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE' } : c));
      if (card.status === 'ACTIVE') {
        await freezeCard(card.id);
      } else {
        await unfreezeCard(card.id);
      }
    } catch (err) {
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: card.status } : c));
      setError(err instanceof ApiException ? err.message : 'Failed to update card status');
    }
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const totalBalanceEUR = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      const bal = (acc.balance || 0) / 100;
      if (acc.currency === 'EUR') return sum + bal;
      const rate = rates.find(r => r.base_currency === acc.currency && r.target_currency === 'EUR');
      if (rate) {
        return sum + (bal * parseFloat(rate.rate));
      }
      return sum;
    }, 0);
  }, [accounts, rates]);

  const estimatedFx = useMemo(() => {
    if (!fxAmount || !fxSourceId || !fxDestId) return null;
    const sourceAcc = accounts.find(a => a.id === fxSourceId);
    const destAcc = accounts.find(a => a.id === fxDestId);
    if (!sourceAcc || !destAcc) return null;

    const rateObj = rates.find(r => r.base_currency === sourceAcc.currency && r.target_currency === destAcc.currency);
    if (!rateObj) return null;

    const rate = parseFloat(rateObj.rate);
    const amountNum = parseFloat(fxAmount);
    return {
      amount: (amountNum * rate).toFixed(2),
      rate: rate,
      currency: destAcc.currency
    };
  }, [fxAmount, fxSourceId, fxDestId, accounts, rates]);

  const formatMoney = (amountInMinor: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${(amountInMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMajor = (amount: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading && !accounts.length) {
    return (
      <div className="flex h-screen bg-[#0A0A0B] items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[#C5A059] font-serif text-2xl tracking-widest uppercase"
        >
          VaultCore
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0B]">

      <Sidebar />

      {selectedCard && (
        <CardManagementDrawer
          card={selectedCard}
          account={accounts.find(a => a.id === selectedCard.account_id)!}
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
          onCardUpdate={(updatedCard) => setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c))}
          onError={setError}
        />
      )}

      <main className="flex-1 overflow-y-auto relative p-4 sm:p-8 md:p-12">

        {/* Subtle Ambient Light (No cheap neon) */}
        <div className="fixed top-0 right-0 w-1/2 h-full bg-gradient-to-bl from-[#C5A059]/[0.015] to-transparent pointer-events-none"></div>

        {/* Global Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-8 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="bg-[#121214] flex items-center gap-4 px-6 py-4 border border-red-500/20 shadow-2xl rounded-xl">
                <Shield className="w-5 h-5 text-red-400" />
                <p className="text-sm text-zinc-200">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="relative z-10 max-w-7xl mx-auto space-y-10"
        >

          {/* Header */}
          <motion.header variants={fadeUpItem} className="flex items-end justify-between border-b border-white/[0.04] pb-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Total Wealth Overview</p>
              <h2 className="text-5xl md:text-6xl font-serif text-white font-light tracking-tight flex items-baseline gap-2 tabular-nums">
                {formatMajor(totalBalanceEUR, 'EUR')}
                <span className="text-xl text-zinc-600 font-sans tracking-normal">EUR</span>
              </h2>
            </div>

            {/* Minimal Analytics Summary */}
            {analytics && (
              <div className="hidden md:flex flex-col items-end gap-1 text-right">
                <div className="flex gap-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">Inflow</p>
                    <p className="text-sm tabular-nums text-zinc-300 tracking-tight font-light">{formatMajor(analytics.total_income, analytics.base_currency)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">Outflow</p>
                    <p className="text-sm tabular-nums text-zinc-300 tracking-tight font-light">{formatMajor(analytics.total_expenses, analytics.base_currency)}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left Column: Accounts Portfolio & Transactions */}
            <div className="lg:col-span-7 flex flex-col gap-8">

              {/* Portfolio Accounts */}
              <motion.section variants={fadeUpItem}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500">Your Portfolio</h3>
                  <div className="flex items-center gap-3">
                    <select
                      value={newAccountCurrency}
                      onChange={e => setNewAccountCurrency(e.target.value)}
                      className="bg-transparent text-xs text-zinc-400 outline-none border-b border-white/10 pb-1 cursor-pointer focus:border-[#C5A059] transition-colors"
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="PLN">PLN</option>
                    </select>
                    <button
                      onClick={handleCreateAccount}
                      disabled={isCreatingAccount}
                      className="text-xs font-medium text-[#C5A059] hover:text-[#E5C048] transition-colors disabled:opacity-50 uppercase tracking-wider flex items-center gap-1 group"
                    >
                      <Plus className="w-3 h-3 group-hover:scale-110 transition-transform" /> Open Account
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {accounts.map((acc, index) => (
                    <motion.div
                      key={acc.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      transition={springTransition}
                      className={`bg-[#121214] border border-white/[0.06] shadow-xl p-6 flex flex-col justify-between h-40 relative overflow-hidden rounded-xl ${index === 0 ? 'border-t-[#C5A059]/20 border-b-[#C5A059]/10' : ''}`}
                    >
                      {/* Premium Material Shine */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                      <div className="flex justify-between items-start z-10">
                        <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center font-serif text-sm bg-black/40 shadow-inner text-zinc-300">
                          {CURRENCY_SYMBOLS[acc.currency] || acc.currency}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono tracking-wider">...{acc.id.substring(acc.id.length - 4)}</p>
                      </div>
                      <div className="z-10">
                        <p className="text-xs text-zinc-500 mb-1 tracking-wide">{acc.currency} Account</p>
                        <p className="text-xl font-light text-zinc-100 tracking-tight tabular-nums">{formatMoney(acc.balance || 0, acc.currency)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>

              {/* Cards Management */}
              <motion.section variants={fadeUpItem}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500">Virtual & Physical Cards</h3>
                  <button
                    onClick={() => handleIssueCard(accounts[0]?.id)}
                    disabled={isIssuingCard || accounts.length === 0}
                    className="text-xs font-medium text-[#C5A059] hover:text-[#E5C048] transition-colors disabled:opacity-50 uppercase tracking-wider flex items-center gap-1 group"
                  >
                    <Plus className="w-3 h-3 group-hover:scale-110 transition-transform" /> Issue New Card
                  </button>
                </div>

                <div className="flex sm:grid sm:grid-cols-2 gap-4 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
                  <AnimatePresence>
                    {cards.length === 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-2 py-8 text-center border border-dashed border-white/10 rounded-xl min-w-full">
                        <p className="text-zinc-600 text-xs uppercase tracking-widest font-medium">No active cards</p>
                      </motion.div>
                    )}
                    {cards.map((card) => {
                      const account = accounts.find(a => a.id === card.account_id);
                      const isFrozen = card.status === 'FROZEN';

                      return (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                          key={card.id}
                          onClick={() => setSelectedCard(card)}
                          className={`relative overflow-hidden rounded-xl border p-5 flex flex-col justify-between h-44 shadow-2xl transition-colors duration-500 cursor-pointer min-w-[85vw] sm:min-w-0 snap-center ${isFrozen ? 'bg-zinc-900 border-white/[0.04]' : 'bg-[#18181B] border-[#C5A059]/20'}`}
                        >
                          {/* Radial gradient representing physical metal */}
                          <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] opacity-30 pointer-events-none transition-colors duration-500 ${isFrozen ? 'from-zinc-700 via-zinc-900 to-black' : 'from-[#C5A059]/20 via-zinc-900 to-black'}`}></div>

                          <div className="relative z-10 flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              {/* Chip Icon */}
                              <div className="w-8 h-6 rounded bg-gradient-to-br from-[#D4AF37] to-[#8C6D1F] flex items-center justify-center opacity-80 shadow-inner">
                                <div className="w-full h-full border border-yellow-900/20 rounded opacity-50"></div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Status Badge */}
                              <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border ${isFrozen ? 'border-amber-500/30 text-amber-500/70' : 'border-emerald-500/30 text-emerald-500/70'}`}>
                                {card.status}
                              </span>
                            </div>
                          </div>

                          <div className="relative z-10 space-y-4 pointer-events-none">
                            <div className="font-mono text-zinc-300 tracking-[0.3em] text-lg tabular-nums">
                              •••• {card.last_four}
                            </div>
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[9px] uppercase tracking-widest text-zinc-500">{card.card_type}</p>
                                <p className="text-xs font-semibold tracking-wide text-zinc-400">{account?.currency} Account</p>
                              </div>
                              {isFrozen && (
                                <div className="p-1.5 rounded-full border border-amber-500/40 text-amber-500 bg-amber-500/10">
                                  <Lock className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.section>

              {/* Transactions */}
              <motion.section variants={fadeUpItem}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500">Recent Activity</h3>
                </div>

                <div className="surface-premium rounded-xl overflow-hidden min-h-[150px] relative">
                  {ledgerEntries.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-zinc-600 text-xs uppercase tracking-widest font-medium">No recorded transactions</p>
                    </div>
                  ) : null}

                  <table className="w-full text-left text-sm relative z-10">
                    <tbody className="divide-y divide-white/[0.03]">
                      {ledgerEntries.map((entry, idx) => (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          key={entry.id || idx}
                          className="hover:bg-white/[0.01] transition-colors group"
                        >
                          <td className="py-5 px-6">
                            <div className="flex items-center gap-4">
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 group-hover:bg-[#C5A059] transition-colors"></div>
                              <span className="text-zinc-300 font-medium tracking-wide text-xs">
                                {entry.description || (entry.direction === 'CREDIT' ? 'Deposit' : 'Transfer')}
                              </span>
                            </div>
                          </td>
                          <td className="py-5 px-6 text-zinc-500 text-xs tracking-wide">Today</td>
                          <td className={`py-5 px-6 tabular-nums text-right text-xs tracking-wider ${entry.direction === 'CREDIT' ? 'text-zinc-300' : 'text-zinc-500'}`}>
                            {entry.direction === 'CREDIT' ? '+' : '-'}{formatMoney(entry.amount, entry.currency)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            </div>

            {/* Right Column: Analytics & Operations */}
            <div className="lg:col-span-5 flex flex-col gap-8">

              {/* Operations Panel */}
              <motion.section variants={fadeUpItem} className="surface-premium p-8 relative overflow-hidden rounded-xl">
                <div className="flex gap-6 border-b border-white/[0.04] pb-4 mb-6">
                  <button
                    onClick={() => setActiveTab('transfer')}
                    className={`text-xs uppercase tracking-widest font-semibold transition-colors relative ${activeTab === 'transfer' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    Transfer
                    {activeTab === 'transfer' && <motion.div layoutId="tab-indicator" className="absolute -bottom-[17px] left-0 right-0 h-[1px] bg-[#C5A059]"></motion.div>}
                  </button>
                  <button
                    onClick={() => setActiveTab('fx')}
                    className={`text-xs uppercase tracking-widest font-semibold transition-colors relative ${activeTab === 'fx' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    Exchange
                    {activeTab === 'fx' && <motion.div layoutId="tab-indicator" className="absolute -bottom-[17px] left-0 right-0 h-[1px] bg-[#C5A059]"></motion.div>}
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'transfer' ? (
                    <motion.form
                      key="transfer"
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={springTransition}
                      onSubmit={handleTransfer} className="space-y-5"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">From</label>
                        <select
                          value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}
                          className="w-full px-4 py-3 text-sm appearance-none cursor-pointer bg-transparent border border-white/[0.06] text-[#E5E7EB] rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12]"
                        >
                          <option value="" disabled className="bg-[#121214]">Select Source...</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-[#121214]">{acc.currency} • ...{acc.id.substring(acc.id.length - 4)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">To</label>
                        <select
                          value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)}
                          className="w-full px-4 py-3 text-sm appearance-none cursor-pointer bg-transparent border border-white/[0.06] text-[#E5E7EB] rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12]"
                        >
                          <option value="" disabled className="bg-[#121214]">Select Destination...</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-[#121214]">{acc.currency} • ...{acc.id.substring(acc.id.length - 4)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1 pt-2">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Amount</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">
                            {CURRENCY_SYMBOLS[accounts.find(a => a.id === sourceAccountId)?.currency || 'EUR'] || ''}
                          </span>
                          <input
                            type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 text-lg tabular-nums placeholder:text-zinc-700 bg-transparent border border-white/[0.06] text-[#E5E7EB] rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12]"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={transferStatus?.type === 'pending' || !sourceAccountId || !destinationAccountId || !amount}
                        className="w-full py-4 mt-2 flex justify-between items-center px-6 uppercase tracking-widest text-[10px] bg-[#1C1C1E] text-white border border-[#C5A059]/30 hover:bg-[#252528] hover:border-[#C5A059]/60 shadow-lg shadow-black/40 font-medium rounded-lg transition-all duration-500 ease-out disabled:opacity-50"
                      >
                        Authorize Transfer <ArrowRight className="w-3 h-3" />
                      </button>

                      <AnimatePresence>
                        {transferStatus && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <p className={`text-xs mt-3 flex items-center gap-2 ${transferStatus.type === 'error' ? 'text-red-400' : 'text-[#C5A059]'}`}>
                              {transferStatus.type === 'success' ? <Check className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                              {transferStatus.message}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.form>
                  ) : (
                    <motion.form
                      key="fx"
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={springTransition}
                      onSubmit={handleFx} className="space-y-5"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Sell</label>
                        <select
                          value={fxSourceId} onChange={(e) => setFxSourceId(e.target.value)}
                          className="w-full px-4 py-3 text-sm appearance-none cursor-pointer bg-transparent border border-white/[0.06] text-[#E5E7EB] rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12]"
                        >
                          <option value="" disabled className="bg-[#121214]">Select Currency...</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-[#121214]">{acc.currency} • ...{acc.id.substring(acc.id.length - 4)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Buy</label>
                        <select
                          value={fxDestId} onChange={(e) => setFxDestId(e.target.value)}
                          className="w-full px-4 py-3 text-sm appearance-none cursor-pointer bg-transparent border border-white/[0.06] text-[#E5E7EB] rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12]"
                        >
                          <option value="" disabled className="bg-[#121214]">Select Currency...</option>
                          {accounts.filter(a => a.currency !== accounts.find(s => s.id === fxSourceId)?.currency).map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-[#121214]">{acc.currency} • ...{acc.id.substring(acc.id.length - 4)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1 pt-2">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Amount</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">
                            {CURRENCY_SYMBOLS[accounts.find(a => a.id === fxSourceId)?.currency || 'EUR'] || ''}
                          </span>
                          <input
                            type="number" step="0.01" value={fxAmount} onChange={(e) => setFxAmount(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 text-lg tabular-nums placeholder:text-zinc-700 bg-transparent border border-white/[0.06] text-[#E5E7EB] rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12]"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {estimatedFx && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between items-center py-2 px-1 border-t border-b border-white/[0.04]">
                          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Estimated</span>
                          <span className="text-sm tabular-nums text-zinc-300">
                            {CURRENCY_SYMBOLS[estimatedFx.currency] || ''}{estimatedFx.amount} <span className="text-zinc-600 text-[10px] uppercase ml-1">(@ {estimatedFx.rate})</span>
                          </span>
                        </motion.div>
                      )}

                      <button
                        type="submit"
                        disabled={fxStatus?.type === 'pending' || !fxSourceId || !fxDestId || !fxAmount}
                        className="btn-gold w-full py-4 mt-2 flex justify-between items-center px-6 uppercase tracking-widest text-[10px] disabled:opacity-50"
                      >
                        Execute Trade <ArrowRight className="w-3 h-3" />
                      </button>

                      <AnimatePresence>
                        {fxStatus && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <p className={`text-xs mt-3 flex items-center gap-2 ${fxStatus.type === 'error' ? 'text-red-400' : 'text-[#C5A059]'}`}>
                              {fxStatus.type === 'success' ? <Check className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                              {fxStatus.message}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.section>

              {/* Analytics Insights */}
              <motion.section variants={fadeUpItem} className="surface-premium p-8 rounded-xl min-h-[160px] flex flex-col justify-center">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500">Wealth Health</h3>
                  <Activity className="w-3 h-3 text-[#C5A059]" />
                </div>

                {analytics && analytics.categories.length > 0 ? (
                  <div className="space-y-5 flex-1">
                    {analytics.categories.slice(0, 3).map((cat, idx) => {
                      const total = analytics.total_expenses;
                      const percent = total > 0 ? (cat.amount / total) * 100 : 0;
                      return (
                        <div key={cat.category} className="group">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors tracking-wide">{cat.category}</span>
                            <span className="text-zinc-400 tabular-nums">{formatMajor(cat.amount, analytics.base_currency)}</span>
                          </div>
                          <div className="h-[1px] w-full bg-zinc-900 overflow-hidden relative">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(percent, 100)}%` }}
                              transition={{ duration: 1.5, ease: "easeOut", delay: idx * 0.2 }}
                              className="absolute top-0 left-0 h-full bg-zinc-600 group-hover:bg-[#C5A059] transition-colors duration-500"
                            ></motion.div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-50">
                    <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
                    <div className="w-32 h-1 bg-white/[0.03] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ x: '-100%' }} animate={{ x: '200%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="w-1/2 h-full bg-white/10"
                      />
                    </div>
                  </div>
                )}
              </motion.section>

            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
