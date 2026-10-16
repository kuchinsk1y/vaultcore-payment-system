"use client";

import { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  isConfirmationRequired,
  submitTransfer,
  type AccountSummary,
  type Contact,
  type TransferConfirmationRequired,
  type TransferRequest,
} from '@/lib/api';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function useTransferForm(accounts: AccountSummary[]) {
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Large transfers are held until the user enters a one-time code
  const [pendingConfirmation, setPendingConfirmation] = useState<TransferConfirmationRequired | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  // The same payload and idempotency key are reused for the confirmed retry
  const attempt = useRef<{ payload: TransferRequest; key: string } | null>(null);

  // Until the user picks one, the source defaults to the first account
  const sourceAccountId = selectedSourceId || accounts[0]?.id || '';

  const sourceAccount = accounts.find((a) => a.id === sourceAccountId);

  const changeSource = (id: string) => {
    setSelectedSourceId(id);
    setTargetAccountId(''); // currency may no longer match
  };

  const selectContact = (contact: Contact) => {
    if (!sourceAccount) return;

    const match = contact.accounts.find((a) => a.currency === sourceAccount.currency);
    if (match) {
      setTargetAccountId(match.account_id);
      setErrorMessage('');
    } else {
      setTargetAccountId('');
      setErrorMessage(
        `${contact.full_name} does not have a ${sourceAccount.currency} account. ` +
          `They can only receive: ${contact.accounts.map((a) => a.currency).join(', ')}`,
      );
    }
  };

  const send = async (payload: TransferRequest, key: string) => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const result = await submitTransfer(payload, key);

      if (isConfirmationRequired(result)) {
        attempt.current = { payload, key };
        setPendingConfirmation(result);
        setConfirmationCode('');
        setStatus('idle');
        return;
      }

      attempt.current = null;
      setPendingConfirmation(null);
      setStatus('success');
      setAmount('');
      setTargetAccountId('');
    } catch (err) {
      // A wrong code keeps the confirmation open so the user can retry
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceAccountId || !targetAccountId || !amount) return;

    await send(
      {
        source_account_id: sourceAccountId,
        destination_account_id: targetAccountId,
        amount: Math.round(parseFloat(amount) * 100),
        currency: sourceAccount?.currency || 'EUR',
      },
      uuidv4(),
    );
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attempt.current || !pendingConfirmation || confirmationCode.length !== 6) return;

    await send(
      {
        ...attempt.current.payload,
        confirmation_id: pendingConfirmation.confirmation_id,
        confirmation_code: confirmationCode,
      },
      attempt.current.key,
    );
  };

  const cancelConfirmation = () => {
    attempt.current = null;
    setPendingConfirmation(null);
    setConfirmationCode('');
    setStatus('idle');
    setErrorMessage('');
  };

  return {
    sourceAccountId,
    sourceAccount,
    changeSource,
    targetAccountId,
    setTargetAccountId,
    amount,
    setAmount,
    status,
    resetStatus: () => setStatus('idle'),
    errorMessage,
    selectContact,
    submit,
    pendingConfirmation,
    confirmationCode,
    setConfirmationCode,
    confirm,
    cancelConfirmation,
  };
}
