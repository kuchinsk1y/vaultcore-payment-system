import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, X, Eye, EyeOff, ChevronRight, Settings2 } from 'lucide-react'; // Shield, CreditCard, Activity
import { Card, Account, freezeCard, unfreezeCard, ApiException } from '@/lib/api';
import { useState } from 'react';

interface CardManagementDrawerProps {
  card: Card;
  account: Account;
  isOpen: boolean;
  onClose: () => void;
  onCardUpdate: (updatedCard: Card) => void;
  onError: (error: string) => void;
}

export default function CardManagementDrawer({ card, account, isOpen, onClose, onCardUpdate, onError }: CardManagementDrawerProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isFrozen = card.status === 'FROZEN';

  const handleToggleFreeze = async () => {
    setIsProcessing(true);
    try {
      const optimisticCard = { ...card, status: isFrozen ? 'ACTIVE' : 'FROZEN' } as Card;
      onCardUpdate(optimisticCard);

      if (isFrozen) {
        await unfreezeCard(card.id);
      } else {
        await freezeCard(card.id);
      }
    } catch (error) {
      onCardUpdate(card); // Revert
      onError(error instanceof ApiException ? error.message : 'Failed to update card status');
    } finally {
      setIsProcessing(false);
    }
  };

  const drawerContent = (
    <>
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-[#C5A059]/[0.05] to-transparent rounded-full pointer-events-none"></div>

      <div className="p-6 md:p-8 flex-1 overflow-y-auto hide-scrollbar relative z-10">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C5A059]"></div>
            <h3 className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">Card Management</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/[0.04] text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Large Premium Card Preview */}
        <div className={`relative w-full aspect-[1.586] rounded-2xl p-6 flex flex-col justify-between mb-8 shadow-2xl overflow-hidden transition-colors duration-700 ${isFrozen ? 'bg-zinc-900 border border-white/[0.04]' : 'bg-[#18181B] border border-[#C5A059]/30'}`}>
          <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] opacity-40 pointer-events-none transition-colors duration-700 ${isFrozen ? 'from-zinc-700 via-zinc-900 to-black' : 'from-[#C5A059]/30 via-zinc-900 to-black'}`}></div>
          <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_20%,white_25%,transparent_30%)] opacity-[0.03] mix-blend-overlay"></div>

          <div className="relative z-10 flex justify-between items-start">
            <div className="w-10 h-8 rounded bg-gradient-to-br from-[#D4AF37] to-[#8C6D1F] flex items-center justify-center opacity-80 shadow-inner">
              <div className="w-full h-full border border-yellow-900/20 rounded opacity-50"></div>
            </div>
            <span className={`text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-sm border backdrop-blur-md ${isFrozen ? 'border-amber-500/30 text-amber-500/80 bg-amber-500/10' : 'border-emerald-500/30 text-emerald-500/80 bg-emerald-500/10'}`}>
              {card.status}
            </span>
          </div>

          <div className="relative z-10 space-y-4 mt-auto">
            <div className="font-mono text-zinc-200 tracking-[0.3em] text-2xl tabular-nums">
              {isRevealed ? `4242 4242 4242 ${card.last_four}` : `•••• •••• •••• ${card.last_four}`}
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{card.card_type} • {account.currency}</p>
                <p className="text-sm tracking-wide text-zinc-300 font-serif">VaultCore Member</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">CVC</p>
                <p className="font-mono text-sm tracking-widest text-zinc-300">{isRevealed ? '942' : '•••'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions List */}
        <div className="space-y-3">
          {/* Reveal Details Toggle */}
          <button
            onClick={() => setIsRevealed(!isRevealed)}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-white/[0.04] bg-[#121214] hover:bg-[#1C1C1E] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </div>
              <div className="text-left">
                <p className="text-sm text-zinc-200 font-medium">Card Details</p>
                <p className="text-[11px] text-zinc-500">{isRevealed ? 'Hide secure numbers' : 'Reveal full number and CVC'}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-[#C5A059] transition-colors" />
          </button>

          {/* Freeze Toggle */}
          <button
            onClick={handleToggleFreeze}
            disabled={isProcessing}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-white/[0.04] bg-[#121214] hover:bg-[#1C1C1E] transition-colors group disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${isFrozen ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-white/[0.03] border-white/[0.06] text-zinc-400 group-hover:text-white'}`}>
                {isFrozen ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </div>
              <div className="text-left">
                <p className={`text-sm font-medium ${isFrozen ? 'text-amber-500/90' : 'text-zinc-200'}`}>
                  {isFrozen ? 'Unfreeze Card' : 'Freeze Card'}
                </p>
                <p className="text-[11px] text-zinc-500">Temporarily disable operations</p>
              </div>
            </div>
            <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${isFrozen ? 'bg-amber-500/40' : 'bg-zinc-800'}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${isFrozen ? 'translate-x-5' : ''}`}></div>
            </div>
          </button>

          {/* Limits */}
          <button
            className="w-full flex items-center justify-between p-4 rounded-xl border border-white/[0.04] bg-[#121214] hover:bg-[#1C1C1E] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                <Settings2 className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-sm text-zinc-200 font-medium">Spending Limits</p>
                <p className="text-[11px] text-zinc-500">Monthly: Unlimited</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-[#C5A059] transition-colors" />
          </button>
        </div>

      </div>
    </>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          />

          {/* Mobile Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="md:hidden fixed inset-x-0 bottom-0 w-full bg-[#0A0A0B] border border-white/[0.06] rounded-t-3xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {drawerContent}
          </motion.div>

          {/* Desktop Right Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="hidden md:flex fixed top-0 right-0 bottom-0 w-[420px] bg-[#0A0A0B] border-l border-white/[0.06] shadow-2xl z-50 overflow-hidden flex-col"
          >
            {drawerContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
