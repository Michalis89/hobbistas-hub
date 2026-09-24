'use client';

import { useSelector } from 'react-redux';
import { isDemoUserId } from '@/lib/demo';

/**
 * Read structurally rather than through `selectUser`: importing the auth slice
 * pulls the Supabase browser client into every consumer's module graph, which
 * is a lot of weight for one boolean.
 */
type AuthAwareState = { auth?: { user?: { id?: string | null } | null } | null };

/**
 * Whether the signed-in session is the shared read-only demo account.
 *
 * Used to disable write affordances so nobody discovers the restriction by
 * filling in a form and watching it fail. It is not a security control - RLS
 * and `withApiRoute` are - so it only has to be right, not unforgeable.
 */
export function useIsDemoUser(): boolean {
  const userId = useSelector((state: AuthAwareState) => state.auth?.user?.id ?? null);
  return isDemoUserId(userId);
}
