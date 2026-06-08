import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { CanonicalSnapshot, emptySnapshot, normalizeSnapshot } from './normalize';

const STALE_THRESHOLD_MS = 45_000;

export type CanonicalBindingState = {
  data: CanonicalSnapshot;
  liveConnection: boolean;
  stale: boolean;
  bindingError: string;
  lastFetchedAt: string;
  refresh: () => Promise<void>;
};

export function useCanonicalSnapshot(intervalMs = 10_000): CanonicalBindingState {
  const [data, setData] = useState<CanonicalSnapshot>(emptySnapshot());
  const [liveConnection, setLiveConnection] = useState(false);
  const [stale, setStale] = useState(true);
  const [bindingError, setBindingError] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState('');
  const inFlight = useRef(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const fetchSnapshot = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/runtime-canonical`, {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        setLiveConnection(false);
        setStale(true);
        setBindingError(`canonical fetch failed: ${res.status}`);
        return;
      }
      const raw = await res.json();
      const snapshot = normalizeSnapshot(raw);
      setData(snapshot);
      setLiveConnection(snapshot.flags.live_connection);
      setStale(false);
      setBindingError(snapshot.strings.error);
      setLastFetchedAt(new Date().toISOString());
    } catch (e) {
      setLiveConnection(false);
      setStale(true);
      setBindingError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    fetchSnapshot();
    const id = setInterval(fetchSnapshot, intervalMs);
    return () => clearInterval(id);
  }, [fetchSnapshot, intervalMs]);

  useEffect(() => {
    if (!lastFetchedAt) return;
    const id = setInterval(() => {
      const age = Date.now() - new Date(lastFetchedAt).getTime();
      if (age > STALE_THRESHOLD_MS) setStale(true);
    }, 5000);
    return () => clearInterval(id);
  }, [lastFetchedAt]);

  useEffect(() => {
    const channel = supabase
      .channel('canonical-invalidation')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runtime_jobs' }, () => fetchSnapshot())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runtime_audit_log' }, () => fetchSnapshot())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSnapshot]);

  return { data, liveConnection, stale, bindingError, lastFetchedAt, refresh: fetchSnapshot };
}
