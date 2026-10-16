"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  /** Re-runs the loader, keeping the previous data on screen while it loads. */
  reload: () => void;
}

/**
 * Runs `load` on mount and whenever `reload()` is called. Stale responses are ignored, so a slow
 * earlier request can never overwrite a newer one.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({
    data: null,
    loading: true,
    error: false,
  });
  const [reloadKey, setReloadKey] = useState(0);

  // Always call the latest loader without making it an effect dependency
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: false });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState((prev) => ({ data: prev.data, loading: false, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: false }));
    setReloadKey((k) => k + 1);
  }, []);

  return { ...state, reload };
}
