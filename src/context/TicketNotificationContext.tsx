'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSelector } from 'react-redux';
import { supabase } from '@/lib/supabase-client';
import { selectIsAuthenticated, selectIsLoading } from '@/store/slices/authSlice';

type TicketNotificationSummary = {
  unread_count: number;
  user_unread_count: number;
  admin_unread_count: number;
};

type TicketNotificationContextValue = {
  count: number;
  userCount: number;
  adminCount: number;
  totalCount: number;
  refresh: () => void;
};

const TicketNotificationContext = createContext<TicketNotificationContextValue>({
  count: 0,
  userCount: 0,
  adminCount: 0,
  totalCount: 0,
  refresh: () => {},
});

const ZERO_SUMMARY: TicketNotificationSummary = {
  unread_count: 0,
  user_unread_count: 0,
  admin_unread_count: 0,
};

// Realtime fires many events in bursts — debounce to avoid rapid-fire HTTP calls
const REALTIME_DEBOUNCE_MS = 500;
// Fallback poll: Realtime handles real-time updates; this is just a safety net
const FALLBACK_INTERVAL_MS = 5 * 60 * 1000;
// Returning to the tab only refetches if the summary has gone stale
const VISIBILITY_MIN_AGE_MS = 60 * 1000;

export function TicketNotificationProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isAuthLoading = useSelector(selectIsLoading);
  const enabled = isAuthenticated && !isAuthLoading;

  const [summary, setSummary] = useState<TicketNotificationSummary>(ZERO_SUMMARY);
  const inFlightRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedAtRef = useRef(0);

  // `load` reads `enabled` through a ref rather than closing over it. Auth
  // loading flips on every background session check, and a `load` that changed
  // identity with it tore down and re-created the Realtime channel each time,
  // firing a fresh HTTP request on every flip.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabledRef.current) {
      inFlightRef.current?.abort();
      return;
    }

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    try {
      const response = await fetch('/api/notifications/tickets/summary', {
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: TicketNotificationSummary;
      } | null;

      if (!response.ok) {
        setSummary(ZERO_SUMMARY);
        return;
      }

      lastLoadedAtRef.current = Date.now();
      setSummary({
        unread_count: payload?.data?.unread_count ?? 0,
        user_unread_count: payload?.data?.user_unread_count ?? 0,
        admin_unread_count: payload?.data?.admin_unread_count ?? 0,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {return;}
      setSummary(ZERO_SUMMARY);
    }
  }, []);

  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) {clearTimeout(debounceRef.current);}
    debounceRef.current = setTimeout(() => void load(), REALTIME_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    if (!enabled) {
      inFlightRef.current?.abort();
      return;
    }

    const initialTimer = window.setTimeout(() => void load(), 0);
    const channel = supabase
      .channel('ticket-notifications-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_reads' }, debouncedLoad)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_settings' }, debouncedLoad)
      .subscribe();

    const fallbackTimer = window.setInterval(() => void load(), FALLBACK_INTERVAL_MS);

    // Debounced, and skipped when the data is still fresh. An undebounced fetch
    // on every focus change meant alt-tabbing produced a request each time.
    const handleVisibility = () => {
      if (document.hidden) {
        return;
      }
      if (Date.now() - lastLoadedAtRef.current < VISIBILITY_MIN_AGE_MS) {
        return;
      }
      debouncedLoad();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(fallbackTimer);
      if (debounceRef.current) {clearTimeout(debounceRef.current);}
      inFlightRef.current?.abort();
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, load, debouncedLoad]);

  return (
    <TicketNotificationContext.Provider
      value={{
        count: enabled ? summary.unread_count : 0,
        userCount: enabled ? summary.user_unread_count : 0,
        adminCount: enabled ? summary.admin_unread_count : 0,
        totalCount: enabled ? summary.unread_count : 0,
        refresh: load,
      }}
    >
      {children}
    </TicketNotificationContext.Provider>
  );
}

export function useTicketNotifications(): TicketNotificationContextValue {
  return useContext(TicketNotificationContext);
}
