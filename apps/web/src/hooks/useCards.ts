"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAccounts,
  fetchCards,
  freezeCard,
  issueCard,
  setCardPin,
  unfreezeCard,
  type AccountSummary,
  type Card,
} from '@/lib/api';

type PinStatus = 'idle' | 'loading' | 'success' | 'error';

export function useCards() {
  const [cards, setCards] = useState<Card[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Issue-card modal
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedAccountForCard, setSelectedAccountForCard] = useState('');

  // PIN modal
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinStatus, setPinStatus] = useState<PinStatus>('idle');

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCards(), fetchAccounts()])
      .then(([cardsRes, accountsRes]) => {
        if (cancelled) return;
        if (cardsRes.status === 'success') setCards(cardsRes.data);
        setAccounts(accountsRes);
        setSelectedAccountForCard((current) => current || accountsRes[0]?.id || '');
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const handleIssueCard = async () => {
    try {
      await issueCard(selectedAccountForCard);
      setIsIssueModalOpen(false);
      reload();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFreeze = async (cardId: string, currentStatus: string) => {
    try {
      await (currentStatus === 'FROZEN' ? unfreezeCard(cardId) : freezeCard(cardId));
      reload();
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinStatus('loading');

    try {
      await setCardPin(selectedCardId, newPin);
      setPinStatus('success');
      setTimeout(() => {
        setIsPinModalOpen(false);
        setNewPin('');
        setPinStatus('idle');
      }, 2000);
    } catch (err) {
      console.error(err);
      setPinStatus('error');
    }
  };

  return {
    cards,
    accounts,
    loading,
    isIssueModalOpen,
    setIsIssueModalOpen,
    selectedAccountForCard,
    setSelectedAccountForCard,
    isPinModalOpen,
    setIsPinModalOpen,
    selectedCardId,
    setSelectedCardId,
    newPin,
    setNewPin,
    pinStatus,
    handleIssueCard,
    handleToggleFreeze,
    handleChangePin,
  };
}
