"use client";

import { useTranslations } from 'next-intl';
import { PageShell } from '@/components/ui/PageShell';
import { Plus, Lock, Unlock, Settings2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCards } from '@/hooks/useCards';

export default function CardsPage() {
  const t = useTranslations('Cards');
  const {
    cards,
    accounts,
    loading,
    isIssueModalOpen,
    setIsIssueModalOpen,
    selectedAccountForCard,
    setSelectedAccountForCard,
    isPinModalOpen,
    setIsPinModalOpen,
    setSelectedCardId,
    newPin,
    setNewPin,
    pinStatus,
    handleIssueCard,
    handleToggleFreeze,
    handleChangePin,
  } = useCards();

  if (loading) {
    return <div className="animate-pulse h-64 bg-white/[0.02] rounded-2xl surface-premium"></div>;
  }

  return (
    <PageShell
      title={t('title')}
      actions={
        <button
          onClick={() => setIsIssueModalOpen(true)}
          className="btn-gold px-6 py-3 flex items-center space-x-2 rounded-sm"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs tracking-[0.1em] uppercase">{t('issue')}</span>
        </button>
      }
    >

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {cards.map(card => (
          <div key={card.id} className="group relative perspective-1000 w-full h-[240px]">
            {/* The 3D flip card */}
            <div className="w-full h-full absolute transition-all duration-[1500ms] ease-[cubic-bezier(0.4,0,0.2,1)] preserve-3d group-hover:rotate-y-180">
              
              {/* Front side */}
              <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-[#111111] to-[#0D0D0D] rounded-sm p-6 border border-white/[0.04] flex flex-col justify-between overflow-hidden" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.02), inset 0 0 20px rgba(0,0,0,0.5)' }}>
                {/* Subtle brushed metal effect overlay */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white to-transparent mix-blend-overlay"></div>
                
                <div className="flex justify-between items-start z-10">
                  <span className="font-serif text-xl font-medium tracking-[0.2em] uppercase text-gray-300">
                    VaultCore
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      card.status === 'FROZEN' 
                        ? 'bg-blue-400/50' 
                        : card.status === 'BLOCKED'
                          ? 'bg-red-400/50'
                          : 'bg-emerald-400/50'
                    }`}></div>
                    <span className="text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium">
                      {t(card.status.toLowerCase())}
                    </span>
                  </div>
                </div>

                <div className="z-10 mt-auto">
                  <div className="flex items-center space-x-2 text-gray-400 mb-2 font-mono tracking-[0.2em] text-lg opacity-80">
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                    <span className="text-gray-300">{card.last_four}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] text-gray-500 uppercase tracking-[0.25em]">{t(card.card_type.toLowerCase())}</p>
                    {/* Minimalist Gold Chip */}
                    <div className="w-10 h-7 rounded-[4px] border border-[#D4AF37]/30 bg-gradient-to-br from-[#1a1710] to-[#0A0A0A] flex items-center justify-center opacity-80 relative">
                      <div className="w-full h-[1px] bg-[#D4AF37]/20 absolute"></div>
                      <div className="h-full w-[1px] bg-[#D4AF37]/20 absolute"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Back side */}
              <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-[#0D0D0D] rounded-sm p-6 border border-white/[0.04] flex flex-col justify-between" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.02), inset 0 0 20px rgba(0,0,0,0.5)' }}>
                <div className="w-full h-12 bg-black -mx-6 mt-2 mb-4 relative w-[calc(100%+3rem)]"></div>

                <div className="flex gap-4 z-10 justify-center items-center h-full">
                  <button
                    onClick={() => handleToggleFreeze(card.id, card.status)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-white/[0.05] transition-colors text-gray-400 hover:text-white"
                  >
                    {card.status === 'FROZEN' ? <Unlock className="w-6 h-6 mb-2" /> : <Lock className="w-6 h-6 mb-2" />}
                    <span className="text-xs font-medium">{card.status === 'FROZEN' ? t('unfreeze') : t('freeze')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedCardId(card.id);
                      setIsPinModalOpen(true);
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-white/[0.05] transition-colors text-gray-400 hover:text-white"
                  >
                    <Settings2 className="w-6 h-6 mb-2" />
                    <span className="text-xs font-medium">{t('changePin')}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* PIN Change Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-main)]/90 backdrop-blur-sm p-4 transition-all duration-700">
          <div className="surface-premium rounded-sm p-10 max-w-sm w-full animate-in fade-in zoom-in-95 duration-500">
            {pinStatus === 'success' ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 border border-[var(--border-subtle)] bg-[var(--bg-main)] rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-6 h-6 text-[var(--text-main)]" />
                </div>
                <h3 className="font-serif text-xl text-[var(--text-main)] font-medium tracking-[0.1em] uppercase mb-2">PIN Updated</h3>
              </div>
            ) : (
              <form onSubmit={handleChangePin}>
                <h2 className="font-serif text-xl text-[var(--text-main)] tracking-[0.1em] uppercase mb-2">{t('pinTitle')}</h2>
                <p className="text-xs text-[var(--text-muted)] tracking-wide mb-8">{t('pinDesc')}</p>
                
                {pinStatus === 'error' && (
                  <div className="mb-6 p-4 border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-muted)] text-xs tracking-wide flex items-center">
                    <AlertCircle className="w-4 h-4 mr-3 text-red-900" />
                    Error updating PIN
                  </div>
                )}

                <input 
                  type="password"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="input-premium w-full p-4 text-center text-2xl tracking-[1em] font-mono mb-8 rounded-sm"
                  placeholder="••••"
                  required
                />

                <div className="flex space-x-4">
                  <button 
                    type="button"
                    onClick={() => setIsPinModalOpen(false)}
                    className="btn-luxury flex-1 py-3 text-xs tracking-[0.1em] uppercase"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={pinStatus === 'loading' || newPin.length !== 4}
                    className="flex-1 py-3 btn-gold text-xs tracking-[0.1em] uppercase disabled:opacity-30"
                  >
                    {pinStatus === 'loading' ? 'Saving' : t('save')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Issue Card Modal */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-main)]/90 backdrop-blur-sm p-4 transition-all duration-700">
          <div className="surface-premium rounded-sm p-10 max-w-sm w-full animate-in fade-in zoom-in-95 duration-500">
            <h2 className="font-serif text-xl text-[var(--text-main)] tracking-[0.1em] uppercase mb-2">{t('issue')}</h2>
            <p className="text-xs text-[var(--text-muted)] tracking-wide mb-8">Select an account to link with the new card.</p>
            
            <select 
              value={selectedAccountForCard}
              onChange={(e) => setSelectedAccountForCard(e.target.value)}
              className="input-premium w-full p-4 mb-8 appearance-none rounded-sm text-sm"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id} className="bg-[var(--bg-main)]">
                  {acc.currency} Account
                </option>
              ))}
            </select>

            <div className="flex space-x-4">
              <button 
                onClick={() => setIsIssueModalOpen(false)}
                className="btn-luxury flex-1 py-3 text-xs tracking-[0.1em] uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleIssueCard}
                className="flex-1 py-3 btn-gold text-xs tracking-[0.1em] uppercase"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
