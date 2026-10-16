"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  addContact,
  fetchContacts,
  searchContactByPhone,
  type Contact,
  type ContactSearchResult,
} from '@/lib/api';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Unexpected error');

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState<ContactSearchResult | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchContacts()
      .then((data) => {
        if (!cancelled) setContacts(data);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const search = async () => {
    if (!searchPhone) return;
    setSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      setSearchResult(await searchContactByPhone(searchPhone));
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const addFoundContact = async () => {
    if (!searchResult) return;
    try {
      await addContact(searchResult.user.id);
      reload();
      setSearchResult(null);
      setSearchPhone('');
    } catch (err) {
      setSearchError(errorMessage(err));
    }
  };

  return {
    contacts,
    searchPhone,
    setSearchPhone,
    searchResult,
    searchError,
    searching,
    search,
    addFoundContact,
  };
}
