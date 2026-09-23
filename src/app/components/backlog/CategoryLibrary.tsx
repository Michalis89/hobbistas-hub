'use client';

import {
  useEffect,
  useMemo,
  useReducer,
  useCallback,
  useState,
  useTransition,
  useRef,
} from 'react';
import { mutate } from 'swr';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLocale } from '@/context/LocaleContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { apiClient } from '@/lib/api/client';
import {
  exportBacklogAsCSV,
  exportBacklogAsExcel,
  exportBacklogAsJSON,
} from '@/lib/export/backlogExport';
import { yieldToMain } from '@/lib/performance';
import dynamic from 'next/dynamic';
import { enqueueLibraryAddRequest, requestLibraryAddSync } from '@/lib/pwa/libraryAddQueue';

import CategoryHeader from './CategoryHeader';
import CategoryStats from './CategoryStats';
import CreateEntryPanel from './CreateEntryPanel';
import SuggestionsPanel from './SuggestionsPanel';
import StatusFilterBar from './StatusFilterBar';
import LibraryEntryList from './LibraryEntryList';
import type { EditState } from './EntryEditDialog';
import type { MediaCategory, MediaEntry, MediaStatus, SearchResult } from './types';
import { isMediaCategory, getApiBase, supportsExternalApi, getTotalCount } from './types';

const EntryEditDialog = dynamic(() => import('./EntryEditDialog'), {
  ssr: false,
  loading: () => null,
});

export { isMediaCategory };
export type { MediaCategory };

type SteamSyncStatus = 'running' | 'completed' | 'failed';

type SteamSyncJobSnapshot = {
  id: string;
  status: SteamSyncStatus;
  message: string;
  percent: number;
  completedSteps: number;
  totalSteps: number;
  error?: string;
  result?: {
    totalFetched: number;
    mediaInserted: number;
    mediaUpdated: number;
    mediaInsertFailed?: number;
    mediaUpdateFailed?: number;
    entriesInserted: number;
    entriesUpdated: number;
    entriesUpsertFailed?: number;
    rejectedGames?: Array<{ appid: number; name: string; reason: string }>;
    warnings?: string[];
  };
};

type AlertState = {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  title?: string;
} | null;

type SelectedEntry = (MediaEntry & Partial<SearchResult>) | null;

type CategoryLibraryState = {
  search: string;
  activeStatus: MediaStatus | 'all';
  ctaMode: 'create' | 'suggestions' | null;
  libraryEntries: MediaEntry[];
  libraryLoading: boolean;
  libraryError: string | null;
  createQuery: string;
  createResults: SearchResult[];
  createLoading: boolean;
  suggestions: SearchResult[];
  suggestionsLoading: boolean;
  alert: AlertState;
  alertKey: number;
  selectedEntry: SelectedEntry;
};

type SelectedEntryDetails = {
  runtime?: number | null;
  number_of_episodes?: number | null;
  cover_image_large?: string | null;
  cover_image_medium?: string | null;
  banner_image?: string | null;
  genres?: string[] | null;
};

export type EntrySaveMode = 'update' | 'add' | 'local-only';

/**
 * Decides how a dialog save should reach the server.
 *
 * The deciding factor is `entryId` — the id of the user's own library row. An
 * earlier version branched on `mediaId` alone, which is also set for local-first
 * search hits: titles already present in `media_items` that this user has never
 * added. Those took the update path, where the server finds nothing to update
 * and answers 409. That affected every category, since `supportsExternalApi` is
 * true for all six.
 */
export const resolveEntrySaveMode = (
  supportsExternal: boolean,
  entry: { entryId?: number | null; mediaId?: number | null; payload?: unknown },
): EntrySaveMode => {
  if (!supportsExternal) {
    return 'local-only';
  }
  if (entry.mediaId && entry.entryId) {
    return 'update';
  }
  if (entry.mediaId || entry.payload) {
    return 'add';
  }
  return 'local-only';
};

const shouldRevalidateContinueHero = (
  previousStatus: MediaStatus | null | undefined,
  nextStatus: MediaStatus | null | undefined,
  previousProgress: number | null | undefined,
  nextProgress: number | null | undefined,
) => {
  if (previousStatus !== nextStatus) {
    return previousStatus === 'current' || nextStatus === 'current';
  }

  if (nextStatus !== 'current') {
    return false;
  }

  const prev =
    typeof previousProgress === 'number' && Number.isFinite(previousProgress)
      ? previousProgress
      : null;
  const next =
    typeof nextProgress === 'number' && Number.isFinite(nextProgress) ? nextProgress : null;

  return next !== null && next > 0 && prev !== next;
};

type CategoryLibraryAction =
  | { type: 'patch'; payload: Partial<CategoryLibraryState> }
  | {
      type: 'resetForCategory';
      payload: { search: string; activeStatus: MediaStatus | 'all' };
    }
  | { type: 'showAlert'; payload: AlertState }
  | { type: 'clearAlert' }
  | { type: 'applySelectedEntryDetails'; payload: SelectedEntryDetails };

const buildInitialState = (
  normalizedInitialSearch: string,
  normalizedInitialStatus: MediaStatus | 'all',
): CategoryLibraryState => ({
  search: normalizedInitialSearch,
  activeStatus: normalizedInitialStatus,
  ctaMode: null,
  libraryEntries: [],
  libraryLoading: false,
  libraryError: null,
  createQuery: '',
  createResults: [],
  createLoading: false,
  suggestions: [],
  suggestionsLoading: false,
  alert: null,
  alertKey: 0,
  selectedEntry: null,
});

function categoryLibraryReducer(
  state: CategoryLibraryState,
  action: CategoryLibraryAction,
): CategoryLibraryState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.payload };
    case 'resetForCategory':
      return {
        ...state,
        search: action.payload.search,
        activeStatus: action.payload.activeStatus,
        ctaMode: null,
        createQuery: '',
        createResults: [],
      };
    case 'showAlert':
      return {
        ...state,
        alert: action.payload,
        alertKey: state.alertKey + 1,
      };
    case 'clearAlert':
      return { ...state, alert: null };
    case 'applySelectedEntryDetails': {
      if (!state.selectedEntry) {
        return state;
      }
      const details = action.payload;
      const totalRuntime = state.selectedEntry.totalRuntime ?? details.runtime ?? undefined;
      const totalEpisodes =
        state.selectedEntry.totalEpisodes ?? details.number_of_episodes ?? undefined;

      return {
        ...state,
        selectedEntry: {
          ...state.selectedEntry,
          totalRuntime,
          totalEpisodes,
          tags:
            state.selectedEntry.tags.length > 0 ? state.selectedEntry.tags : (details.genres ?? []),
          cover:
            state.selectedEntry.cover ||
            details.cover_image_large ||
            details.cover_image_medium ||
            state.selectedEntry.cover,
          payload: {
            ...(state.selectedEntry.payload || {}),
            runtime: totalRuntime ?? null,
            number_of_episodes: totalEpisodes ?? null,
            cover_image_large: details.cover_image_large ?? null,
            cover_image_medium: details.cover_image_medium ?? null,
            banner_image: details.banner_image ?? null,
            genres: details.genres ?? [],
          },
        },
      };
    }
    default:
      return state;
  }
}

// Helper to check if IGDB rate limit is active
/**
 * A failed request whose message is already written for the person reading it.
 *
 * The API answers with `{ error }`, and that text is deliberately
 * user-facing - a rate limit, a validation failure, or the demo account's
 * read-only notice. Discarding it left every failure looking like a bug.
 */
class LibraryRequestError extends Error {}

async function libraryRequestError(response: Response, fallback: string) {
  const failure = (await response.json().catch(() => null)) as { error?: string } | null;
  return new LibraryRequestError(failure?.error || fallback);
}

/** The server's wording when there is one, the generic line otherwise. */
function messageFor(error: unknown, fallback: string) {
  return error instanceof LibraryRequestError ? error.message : fallback;
}

const RATE_LIMIT_KEY = 'igdb_rate_limit_until';
const isRateLimited = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  const limitUntil = localStorage.getItem(RATE_LIMIT_KEY);
  if (!limitUntil) {
    return false;
  }
  const limitTime = parseInt(limitUntil, 10);
  if (isNaN(limitTime)) {
    return false;
  }
  return Date.now() < limitTime;
};

const setRateLimitCooldown = () => {
  if (typeof window === 'undefined') {
    return;
  }
  // Set cooldown for 24 hours
  const cooldownUntil = Date.now() + 24 * 60 * 60 * 1000;
  localStorage.setItem(RATE_LIMIT_KEY, cooldownUntil.toString());
};

const getRateLimitResetTime = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const limitUntil = localStorage.getItem(RATE_LIMIT_KEY);
  if (!limitUntil) {
    return null;
  }
  const limitTime = parseInt(limitUntil, 10);
  if (isNaN(limitTime)) {
    return null;
  }
  return new Date(limitTime);
};

export default function CategoryLibrary({
  category,
  username,
  steamId,
  initialStatus = 'all',
  initialSearch,
  isReadOnly = false,
  canToggleFavorite = false,
  publicUserId,
  shareToken,
}: Readonly<{
  category: MediaCategory;
  username?: string | null;
  steamId?: string | null;
  initialStatus?: MediaStatus | 'all';
  initialSearch?: string;
  isReadOnly?: boolean;
  canToggleFavorite?: boolean;
  publicUserId?: string;
  shareToken?: string;
}>) {
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [steamSyncing, setSteamSyncing] = useState(false);
  const [steamSyncProgress, setSteamSyncProgress] = useState<SteamSyncJobSnapshot | null>(null);
  const [steamRateLimited, setSteamRateLimited] = useState(isRateLimited());
  const steamPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const normalizedInitialStatus = initialStatus ?? 'all';
  const normalizedInitialSearch = initialSearch?.trim() ?? '';
  const [state, dispatch] = useReducer(
    categoryLibraryReducer,
    buildInitialState(normalizedInitialSearch, normalizedInitialStatus),
  );

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (steamPollIntervalRef.current) {
        clearInterval(steamPollIntervalRef.current);
      }
    };
  }, []);

  // Check rate limit status periodically
  useEffect(() => {
    const checkRateLimit = () => {
      setSteamRateLimited(isRateLimited());
    };

    // Check immediately
    checkRateLimit();

    // Check every minute
    const interval = setInterval(checkRateLimit, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const showAlert = useCallback(
    (payload: AlertState) => {
      dispatch({ type: 'showAlert', payload });
    },
    [dispatch],
  );
  const {
    search,
    activeStatus,
    ctaMode,
    libraryEntries,
    libraryLoading,
    libraryError,
    createQuery,
    createResults,
    createLoading,
    suggestions,
    suggestionsLoading,
    alert,
    alertKey,
    selectedEntry,
  } = state;

  const supportsExternal = supportsExternalApi(category);
  const apiBase = getApiBase(category);
  const selectedEntryRef = useRef<SelectedEntry | null>(selectedEntry);

  useEffect(() => {
    selectedEntryRef.current = selectedEntry;
  }, [selectedEntry]);

  const loadLibraryEntries = useCallback(
    async (forceMocks = false, refreshSelectedEntry = false) => {
      if ((!supportsExternal || forceMocks) && !isReadOnly) {
        dispatch({ type: 'patch', payload: { libraryEntries: [] } });
        return;
      }

      dispatch({ type: 'patch', payload: { libraryLoading: true, libraryError: null } });
      try {
        const fetchUrl =
          isReadOnly && publicUserId
            ? (() => {
                const params = new URLSearchParams({ userId: publicUserId, category });
                if (shareToken) {
                  params.set('token', shareToken);
                }
                return `/api/public/library?${params.toString()}`;
              })()
            : apiBase
              ? `${apiBase}/library?category=${category}`
              : null;

        if (!fetchUrl) {
          dispatch({ type: 'patch', payload: { libraryEntries: [] } });
          return;
        }
        const data = await apiClient.getJsonOrThrow<{ items?: MediaEntry[] }>(fetchUrl);
        const items = Array.isArray(data.items) ? data.items : [];
        dispatch({ type: 'patch', payload: { libraryEntries: items } });
        if (refreshSelectedEntry && selectedEntryRef.current) {
          const refreshed = items.find(item => item.id === selectedEntryRef.current?.id);
          if (refreshed) {
            dispatch({
              type: 'patch',
              payload: {
                selectedEntry: {
                  ...selectedEntryRef.current,
                  ...refreshed,
                },
              },
            });
          }
        }
      } catch (error) {
        console.warn('Library fetch failed:', error);
        dispatch({
          type: 'patch',
          payload: {
            libraryError: 'Failed to load library.',
            libraryEntries: [],
          },
        });
      } finally {
        dispatch({ type: 'patch', payload: { libraryLoading: false } });
      }
    },
    [apiBase, category, isReadOnly, publicUserId, shareToken, supportsExternal],
  );

  useEffect(() => {
    dispatch({
      type: 'resetForCategory',
      payload: {
        activeStatus: normalizedInitialStatus,
        search: normalizedInitialSearch,
      },
    });

    loadLibraryEntries();
  }, [category, normalizedInitialStatus, normalizedInitialSearch, loadLibraryEntries]);

  useEffect(() => {
    if (ctaMode !== 'create') {
      return;
    }

    if (!supportsExternal) {
      dispatch({ type: 'patch', payload: { createResults: [] } });
      return;
    }

    const query = createQuery.trim();
    if (!query) {
      dispatch({ type: 'patch', payload: { createResults: [] } });
      return;
    }

    const timeout = setTimeout(async () => {
      dispatch({ type: 'patch', payload: { createLoading: true } });
      try {
        if (!apiBase) {
          dispatch({ type: 'patch', payload: { createResults: [] } });
          return;
        }
        const response = await apiClient.request(
          `${apiBase}/search?category=${category}&q=${encodeURIComponent(query)}`,
        );
        if (!response.ok) {
          dispatch({ type: 'patch', payload: { createResults: [] } });
          return;
        }
        const data = (await response.json()) as { items?: SearchResult[] };
        const items = Array.isArray(data.items) ? data.items : [];
        dispatch({ type: 'patch', payload: { createResults: items } });
      } catch (error) {
        console.warn('Create search failed:', error);
        dispatch({ type: 'patch', payload: { createResults: [] } });
      } finally {
        dispatch({ type: 'patch', payload: { createLoading: false } });
      }
    }, 350);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, createQuery, ctaMode, supportsExternal]);

  useEffect(() => {
    if (ctaMode !== 'suggestions') {
      return;
    }
    if (!supportsExternal) {
      dispatch({ type: 'patch', payload: { suggestions: [] } });
      return;
    }
    let ignore = false;
    const loadSuggestions = async () => {
      dispatch({ type: 'patch', payload: { suggestionsLoading: true } });
      try {
        if (!apiBase) {
          dispatch({ type: 'patch', payload: { suggestions: [] } });
          return;
        }
        const data = await apiClient.getJsonOrThrow<{ items?: SearchResult[] }>(
          `/api/backlog/personal-suggestions?category=${category}`,
        );
        const items = Array.isArray(data.items) ? data.items : [];
        if (!ignore) {
          dispatch({ type: 'patch', payload: { suggestions: items } });
        }
      } catch (error) {
        console.warn('Suggestions fetch failed:', error);
        if (!ignore) {
          dispatch({ type: 'patch', payload: { suggestions: [] } });
        }
      } finally {
        if (!ignore) {
          dispatch({ type: 'patch', payload: { suggestionsLoading: false } });
        }
      }
    };
    loadSuggestions();
    return () => {
      ignore = true;
    };
  }, [apiBase, category, ctaMode, supportsExternal]);

  const entries = useMemo(() => {
    const base = libraryEntries;
    const normalized = search.trim().toLowerCase();
    return base.filter(entry => {
      if (activeStatus !== 'all' && entry.status !== activeStatus) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        entry.title.toLowerCase().includes(normalized) ||
        entry.subtitle.toLowerCase().includes(normalized) ||
        entry.tags.some(tag => tag.toLowerCase().includes(normalized))
      );
    });
  }, [activeStatus, libraryEntries, search]);

  const counts = useMemo(() => {
    const base = libraryEntries;
    return base.reduce(
      (acc, entry) => {
        acc[entry.status] += 1;
        return acc;
      },
      { planned: 0, current: 0, completed: 0, dropped: 0 },
    );
  }, [libraryEntries]);

  const handleExport = useCallback(
    (format: 'csv' | 'excel' | 'json') => {
      if (format === 'csv') {
        exportBacklogAsCSV(libraryEntries, category);
        return;
      }
      if (format === 'excel') {
        void exportBacklogAsExcel(libraryEntries, category);
        return;
      }
      exportBacklogAsJSON(libraryEntries, category);
    },
    [category, libraryEntries],
  );

  const [, startTransition] = useTransition();
  const openEntryDialog = useCallback(
    (entry: MediaEntry & Partial<SearchResult>) => {
      const payload = entry.payload as
        | {
            episodes?: number | null;
            chapters?: number | null;
            volumes?: number | null;
            runtime?: number | null;
            number_of_episodes?: number | null;
            page_count?: number | null;
            cover_image_large?: string | null;
            cover_image_medium?: string | null;
            banner_image?: string | null;
            genres?: string[] | null;
          }
        | undefined;
      const nextEntry = {
        ...entry,
        totalEpisodes:
          entry.totalEpisodes ?? payload?.episodes ?? payload?.number_of_episodes ?? undefined,
        totalChapters: entry.totalChapters ?? payload?.chapters ?? undefined,
        totalVolumes: entry.totalVolumes ?? payload?.volumes ?? undefined,
        totalRuntime: entry.totalRuntime ?? payload?.runtime ?? undefined,
        totalPages: entry.totalPages ?? payload?.page_count ?? undefined,
      };
      startTransition(() => {
        dispatch({ type: 'patch', payload: { selectedEntry: nextEntry } });
      });

      if (
        (category === 'movies' || category === 'tv') &&
        entry.externalId &&
        !nextEntry.totalRuntime &&
        !nextEntry.totalEpisodes
      ) {
        apiClient
          .request(`/api/movies/details?category=${category}&tmdb_id=${entry.externalId}`)
          .then(async response => {
            if (!response.ok) {
              return null;
            }
            return (await response.json()) as {
              runtime?: number | null;
              number_of_episodes?: number | null;
              cover_image_large?: string | null;
              cover_image_medium?: string | null;
              banner_image?: string | null;
              genres?: string[] | null;
            };
          })
          .then(details => {
            if (!details) {
              return;
            }
            startTransition(() => {
              dispatch({ type: 'applySelectedEntryDetails', payload: details });
            });
          })
          .catch(error => {
            console.warn('TMDB details fetch failed:', error);
          });
      }

      // Fetch IGDB details for games from external source
      if (
        category === 'games' &&
        entry.source === 'external' &&
        entry.externalId &&
        !entry.description
      ) {
        apiClient
          .request(`/api/games/igdb-details?igdbId=${entry.externalId}`)
          .then(async response => {
            if (!response.ok) {
              return null;
            }
            return (await response.json()) as {
              description?: string | null;
              platforms?: string[] | null;
              payload?: Record<string, unknown>;
            };
          })
          .then(details => {
            if (!details) {
              return;
            }
            startTransition(() => {
              dispatch({
                type: 'patch',
                payload: {
                  selectedEntry: selectedEntryRef.current
                    ? {
                        ...selectedEntryRef.current,
                        description: details.description ?? selectedEntryRef.current.description,
                        platforms: details.platforms ?? selectedEntryRef.current.platforms,
                        payload: details.payload ?? selectedEntryRef.current.payload,
                      }
                    : null,
                },
              });
            });
          })
          .catch(error => {
            console.warn('IGDB details fetch failed:', error);
          });
      }
    },
    [category, dispatch, startTransition],
  );

  const handleSaveEntry = async (editState: EditState) => {
    if (!selectedEntry) {
      return;
    }
    const progressValue = Number.parseInt(editState.progress, 10);
    const scoreValue = Number.parseFloat(editState.score);
    const nextProgress = Number.isFinite(progressValue) ? progressValue : null;
    const nextScore = Number.isFinite(scoreValue) ? scoreValue : null;
    const totalCount = getTotalCount(selectedEntry, category);

    // Respect user's explicit status choice - only auto-complete if user hasn't changed status
    // or if they explicitly set it to completed
    const nextStatus = editState.status;
    const shouldAutoCompleteProgress = category !== 'games';
    const nextProgressValue =
      shouldAutoCompleteProgress && editState.status === 'completed' && totalCount !== undefined
        ? totalCount
        : nextProgress;
    const hasPlayedHours =
      typeof nextProgressValue === 'number' &&
      Number.isFinite(nextProgressValue) &&
      nextProgressValue > 0;
    let finalStatus = nextStatus;
    if (finalStatus === 'planned' && hasPlayedHours) {
      finalStatus = 'current';
    }
    if (category === 'games' && nextStatus === 'current' && !hasPlayedHours) {
      finalStatus = 'planned';
    }
    const nextFavorite = editState.isFavorite;
    const previousStatus = selectedEntry.status;
    const isAddingEntry = !selectedEntry.entryId;
    const normalizedSelectedPlatform = editState.selectedPlatform.trim();
    const shouldPersistPlatform =
      category === 'anime' ||
      category === 'games' ||
      category === 'manga' ||
      category === 'books' ||
      category === 'movies' ||
      category === 'tv';

    if (category === 'games' && isAddingEntry && !normalizedSelectedPlatform) {
      showAlert({
        type: 'warning',
        title: 'Platform required',
        message: 'Select a platform before adding a game.',
      });
      return;
    }

    // Close dialog immediately for instant feedback (improves INP)
    startTransition(() => {
      dispatch({ type: 'patch', payload: { selectedEntry: null } });
    });

    // Yield to main thread to allow browser to paint the closed dialog
    await yieldToMain();

    const saveMode = resolveEntrySaveMode(supportsExternal, {
      entryId: selectedEntry.entryId,
      mediaId: selectedEntry.mediaId,
      payload: selectedEntry.payload,
    });

    if (saveMode === 'update') {
      const previousEntries = libraryEntries;
      const optimisticEntries = libraryEntries.map(entry =>
        entry.id === selectedEntry.id
          ? {
              ...entry,
              status: finalStatus,
              isFavorite: nextFavorite,
              selectedPlatform: shouldPersistPlatform
                ? normalizedSelectedPlatform || undefined
                : undefined,
              progress: nextProgressValue ?? undefined,
              score: editState.score || undefined,
              notes: editState.notes || undefined,
            }
          : entry,
      );
      dispatch({ type: 'patch', payload: { libraryEntries: optimisticEntries } });

      try {
        if (!apiBase) {
          throw new Error('Missing API base');
        }
        const response = await apiClient.request(`${apiBase}/library`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId: selectedEntry.mediaId,
            entryId: selectedEntry.entryId,
            clientUpdatedAt: selectedEntry.updatedAt,
            status: finalStatus,
            is_favorite: nextFavorite,
            selected_platform: shouldPersistPlatform
              ? normalizedSelectedPlatform || null
              : undefined,
            progress: nextProgressValue,
            score: nextScore,
            notes: editState.notes || null,
          }),
        });
        if (response.status === 409) {
          dispatch({ type: 'patch', payload: { libraryEntries: previousEntries } });
          await loadLibraryEntries(false, true);
          showAlert({
            type: 'warning',
            title: 'Conflict',
            message: 'Your changes conflicted with another update. Library refreshed.',
          });
          return;
        }
        if (!response.ok) {
          throw await libraryRequestError(response, 'Failed to update entry');
        }
        const payload = (await response.json().catch(() => null)) as {
          entry?: { updated_at?: string | null };
        } | null;
        const nextUpdatedAt =
          typeof payload?.entry?.updated_at === 'string' ? payload.entry.updated_at : null;
        if (nextUpdatedAt) {
          const syncedEntries = optimisticEntries.map(item =>
            item.id === selectedEntry.id ? { ...item, updatedAt: nextUpdatedAt } : item,
          );
          dispatch({
            type: 'patch',
            payload: {
              libraryEntries: syncedEntries,
            },
          });
        }

        await yieldToMain();
        if (
          shouldRevalidateContinueHero(
            previousStatus,
            finalStatus,
            selectedEntry.progress ?? null,
            nextProgressValue,
          )
        ) {
          await mutate('/api/user/continue');
        }

        showAlert({
          type: 'success',
          title: 'Saved',
          message: 'Changes saved.',
        });
      } catch (error) {
        dispatch({ type: 'patch', payload: { libraryEntries: previousEntries } });
        console.warn('Update entry failed:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: messageFor(error, 'Could not save changes. Try again.'),
        });
      }
    } else if (saveMode === 'add') {
      try {
        if (!apiBase) {
          throw new Error('Missing API base');
        }
        const addPayload: Record<string, unknown> = {
          // A known mediaId means the title is already in media_items, so add it
          // by reference instead of re-sending and re-upserting the whole payload.
          ...(selectedEntry.mediaId
            ? { source: 'local', mediaId: selectedEntry.mediaId }
            : { source: 'external', payload: selectedEntry.payload }),
          status: finalStatus,
          is_favorite: nextFavorite,
          selected_platform: shouldPersistPlatform ? normalizedSelectedPlatform || null : undefined,
          progress: nextProgressValue ?? undefined,
          score: nextScore ?? undefined,
          notes: editState.notes || null,
        };

        if (!navigator.onLine) {
          await enqueueLibraryAddRequest(apiBase, addPayload);
          await requestLibraryAddSync();
          showAlert({
            type: 'info',
            title: 'Saved offline',
            message: 'Entry queued and will sync automatically when you are back online.',
          });
          return;
        }

        const response = await apiClient.request(`${apiBase}/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addPayload),
        });
        if (!response.ok) {
          throw await libraryRequestError(response, 'Failed to add entry');
        }
        const addData = (await response.json()) as { mediaId?: number };
        const createdMediaId = addData.mediaId;

        if (typeof createdMediaId === 'number' && Number.isFinite(createdMediaId)) {
          dispatch({
            type: 'patch',
            payload: {
              createResults: createResults.map(result => {
                const sameResult =
                  result.id === selectedEntry.id ||
                  (result.externalId !== undefined &&
                    selectedEntry.externalId !== undefined &&
                    result.externalId === selectedEntry.externalId);
                if (!sameResult) {
                  return result;
                }
                return {
                  ...result,
                  mediaId: createdMediaId,
                  source: 'local',
                };
              }),
            },
          });
        }

        // Defer expensive operations
        await yieldToMain();
        await loadLibraryEntries();
        await yieldToMain();
        if (shouldRevalidateContinueHero(undefined, finalStatus, null, nextProgressValue)) {
          await mutate('/api/user/continue');
        }

        showAlert({
          type: 'success',
          title: 'Added',
          message: `"${selectedEntry.title}" was added to your library.`,
        });
      } catch (error) {
        console.warn('Add entry failed:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          // Surface what the server objected to — a blanket "try again" sends the
          // user in circles when the cause is specific and fixable.
          message:
            error instanceof Error && error.message
              ? error.message
              : 'Could not add entry. Try again.',
        });
      }
    } else {
      dispatch({
        type: 'patch',
        payload: {
          libraryEntries: libraryEntries.map(entry =>
            entry.id === selectedEntry.id
              ? {
                  ...entry,
                  status: finalStatus,
                  isFavorite: nextFavorite,
                  selectedPlatform: shouldPersistPlatform
                    ? normalizedSelectedPlatform || undefined
                    : undefined,
                  progress: nextProgressValue ?? undefined,
                  score: editState.score || undefined,
                  notes: editState.notes || undefined,
                }
              : entry,
          ),
        },
      });
      showAlert({
        type: 'success',
        title: 'Saved',
        message: 'Changes saved.',
      });
    }
  };

  const handleToggleFavorite = useCallback(
    async (entry: MediaEntry) => {
      if (!canToggleFavorite || !entry.mediaId) {
        return;
      }

      const nextFavorite = !entry.isFavorite;
      const previousEntries = libraryEntries;
      const optimisticEntries = libraryEntries.map(item =>
        item.id === entry.id ? { ...item, isFavorite: nextFavorite } : item,
      );
      dispatch({
        type: 'patch',
        payload: {
          libraryEntries: optimisticEntries,
        },
      });

      try {
        if (!apiBase) {
          throw new Error('Missing API base');
        }
        const response = await apiClient.request(`${apiBase}/library`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId: entry.mediaId,
            entryId: entry.entryId,
            clientUpdatedAt: entry.updatedAt,
            is_favorite: nextFavorite,
          }),
        });
        if (response.status === 409) {
          dispatch({ type: 'patch', payload: { libraryEntries: previousEntries } });
          await loadLibraryEntries();
          showAlert({
            type: 'warning',
            title: 'Conflict',
            message: 'Your changes conflicted with another update. Library refreshed.',
          });
          return;
        }
        if (!response.ok) {
          throw await libraryRequestError(response, 'Failed to update favorite');
        }
        const payload = (await response.json().catch(() => null)) as {
          entry?: { updated_at?: string | null };
        } | null;
        const nextUpdatedAt =
          typeof payload?.entry?.updated_at === 'string' ? payload.entry.updated_at : null;
        if (nextUpdatedAt) {
          const syncedEntries = optimisticEntries.map(item =>
            item.id === entry.id ? { ...item, updatedAt: nextUpdatedAt } : item,
          );
          dispatch({
            type: 'patch',
            payload: {
              libraryEntries: syncedEntries,
            },
          });
        }
      } catch (error) {
        dispatch({ type: 'patch', payload: { libraryEntries: previousEntries } });
        console.warn('Favorite toggle failed:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: messageFor(error, 'Could not update favorite. Try again.'),
        });
      }
    },
    [apiBase, canToggleFavorite, libraryEntries, loadLibraryEntries, showAlert],
  );

  const normalizedProgressPercent = (() => {
    const percent = steamSyncProgress?.percent;
    if (typeof percent === 'number' && Number.isFinite(percent)) {
      return Math.max(0, Math.min(100, percent));
    }
    return 0;
  })();
  const stepLabel = `${steamSyncProgress?.completedSteps ?? 0} / ${
    steamSyncProgress?.totalSteps ?? 0
  } steps`;
  const statusLabel = steamSyncProgress?.status
    ? steamSyncProgress.status.charAt(0).toUpperCase() + steamSyncProgress.status.slice(1)
    : 'Running';

  const handleDeleteEntry = useCallback(
    async (entry: MediaEntry) => {
      const clearSelection = () => {
        startTransition(() => {
          dispatch({ type: 'patch', payload: { selectedEntry: null } });
        });
      };

      if (!entry.mediaId) {
        dispatch({
          type: 'patch',
          payload: { libraryEntries: libraryEntries.filter(item => item.id !== entry.id) },
        });
        clearSelection();
        return;
      }

      if (supportsExternal) {
        try {
          if (!apiBase) {
            throw new Error('Missing API base');
          }
          const response = await apiClient.request(`${apiBase}/library`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaId: entry.mediaId }),
          });
          if (!response.ok) {
            throw await libraryRequestError(response, 'Failed to delete entry');
          }
          await loadLibraryEntries();
          if (entry.status === 'current') {
            await mutate('/api/user/continue');
          }
          clearSelection();
          showAlert({
            type: 'success',
            title: 'Removed',
            message: `"${entry.title}" was removed from your library.`,
          });
          return;
        } catch (error) {
          console.warn('Delete entry failed:', error);
          showAlert({
            type: 'error',
            title: 'Error',
            message: messageFor(error, 'Could not remove entry. Try again.'),
          });
        }
      }

      dispatch({
        type: 'patch',
        payload: { libraryEntries: libraryEntries.filter(item => item.id !== entry.id) },
      });
      clearSelection();
    },
    [
      apiBase,
      dispatch,
      libraryEntries,
      loadLibraryEntries,
      showAlert,
      startTransition,
      supportsExternal,
    ],
  );

  const handleSteamSync = async () => {
    try {
      // Check rate limit before starting
      if (isRateLimited()) {
        const resetTime = getRateLimitResetTime();
        const resetTimeStr = resetTime
          ? resetTime.toLocaleString(locale, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : 'tomorrow';
        showAlert({
          type: 'warning',
          title: 'IGDB Rate Limit Reached',
          message: `You&apos;ve hit the IGDB API daily limit. Please try again after ${resetTimeStr}.`,
        });
        return;
      }

      // Clear any existing poll interval
      if (steamPollIntervalRef.current) {
        clearInterval(steamPollIntervalRef.current);
        steamPollIntervalRef.current = null;
      }

      setSteamSyncing(true);
      setSteamSyncProgress({
        id: 'starting',
        status: 'running',
        message: 'Starting sync...',
        percent: 0,
        completedSteps: 0,
        totalSteps: 1,
      });

      // Step 1: Start the sync (fetch Steam games and create job)
      const startResponse = await apiClient.request('/api/integrations/steam/sync/start', {
        method: 'POST',
      });

      if (!startResponse.ok) {
        // Check for rate limit error
        if (startResponse.status === 429) {
          setRateLimitCooldown();
          setSteamRateLimited(true);
          throw new Error(
            'IGDB API rate limit reached. Please try again in 24 hours. Consider using a smaller library or waiting for the limit to reset.',
          );
        }
        const data = (await startResponse.json()) as { error?: string };
        throw new Error(data.error || 'Failed to start Steam sync');
      }

      const startData = (await startResponse.json()) as {
        jobId: string | null;
        totalGames: number;
        batchSize: number;
        estimatedBatches: number;
        message: string;
      };

      if (!startData.jobId) {
        // No games found
        showAlert({
          type: 'info',
          title: 'Steam Sync',
          message: startData.message || 'No games found.',
        });
        setSteamSyncing(false);
        setSteamSyncProgress(null);
        return;
      }

      const jobId = startData.jobId;

      setSteamSyncProgress({
        id: jobId,
        status: 'running',
        message: `Found ${startData.totalGames} games. Processing...`,
        percent: 0,
        completedSteps: 0,
        totalSteps: startData.totalGames,
      });

      // Step 2: Process batches in a loop
      let isComplete = false;
      const allRejectedGames: Array<{ appid: number; name: string; reason: string }> = [];

      while (!isComplete) {
        const processResponse = await apiClient.request(
          `/api/integrations/steam/sync/process?jobId=${jobId}`,
          { method: 'POST' },
        );

        if (!processResponse.ok) {
          // Check for rate limit error
          if (processResponse.status === 429) {
            setRateLimitCooldown();
            setSteamRateLimited(true);
            throw new Error(
              'IGDB API rate limit reached during processing. Progress has been saved. Please try again in 24 hours.',
            );
          }
          const data = (await processResponse.json()) as { error?: string };
          throw new Error(data.error || 'Failed to process batch');
        }

        const processData = (await processResponse.json()) as {
          processed: number;
          totalGames: number;
          isComplete: boolean;
          percent: number;
          message: string;
          rejectedGames?: Array<{ appid: number; name: string; reason: string }>;
        };

        // Collect rejected games from this batch
        if (processData.rejectedGames && processData.rejectedGames.length > 0) {
          allRejectedGames.push(...processData.rejectedGames);
        }

        isComplete = processData.isComplete;

        // Update progress
        setSteamSyncProgress({
          id: jobId,
          status: isComplete ? 'completed' : 'running',
          message: processData.message,
          percent: processData.percent,
          completedSteps: processData.processed,
          totalSteps: processData.totalGames,
        });

        // Add a small delay between batches to avoid rate limiting
        if (!isComplete) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Step 3: Sync completed successfully
      await loadLibraryEntries();
      await mutate('/api/user/continue');

      // Show appropriate alert based on whether there were rejected games
      if (allRejectedGames.length > 0) {
        const rejectedCount = allRejectedGames.length;
        const importedCount = startData.totalGames - rejectedCount;
        const rejectedNames = allRejectedGames
          .slice(0, 10)
          .map(g => g.name)
          .join(', ');
        const moreText =
          allRejectedGames.length > 10 ? ` and ${allRejectedGames.length - 10} more` : '';

        showAlert({
          type: 'warning',
          title: 'Steam sync completed with warnings',
          message: `Successfully imported ${importedCount} games. ${rejectedCount} games were not found in IGDB database and were skipped: ${rejectedNames}${moreText}. Try searching for them manually.`,
        });
      } else {
        showAlert({
          type: 'success',
          title: 'Steam sync complete',
          message: `Successfully synced ${startData.totalGames} games from Steam.`,
        });
      }

      setSteamSyncing(false);
      setSteamSyncProgress(null);
    } catch (error) {
      console.warn('Steam sync failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showAlert({
        type: 'error',
        title: 'Error',
        message: `Steam sync failed. ${errorMessage}`,
      });
      setSteamSyncing(false);
      setSteamSyncProgress(null);

      if (steamPollIntervalRef.current) {
        clearInterval(steamPollIntervalRef.current);
        steamPollIntervalRef.current = null;
      }
    }
  };

  return (
    <div className="relative min-h-screen px-3 py-12 text-foreground sm:px-4 sm:py-16">
      {alert && (
        <Alert
          key={alertKey}
          variant={
            alert.type === 'error'
              ? 'destructive'
              : alert.type === 'success'
                ? 'success'
                : alert.type === 'warning'
                  ? 'warning'
                  : 'info'
          }
          className="mb-6"
        >
          {alert.type === 'success' && <CheckCircle className="h-4 w-4" />}
          {alert.type === 'error' && <XCircle className="h-4 w-4" />}
          {alert.type === 'warning' && <AlertTriangle className="h-4 w-4" />}
          {alert.type === 'info' && <Info className="h-4 w-4" />}
          {alert.title && <AlertTitle>{alert.title}</AlertTitle>}
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <div className="relative mx-auto flex w-full max-w-screen-2xl flex-col gap-5 sm:gap-6">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,hsl(var(--primary)/0.2),transparent_54%)]" />
          <div className="absolute inset-y-10 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_82%_20%,hsl(var(--primary)/0.16),transparent_58%)] md:block" />
        </div>

        <section className="space-y-6">
          <CategoryHeader
            category={category}
            username={username}
            steamId={steamId}
            isSteamSyncing={steamSyncing}
            isSteamRateLimited={steamRateLimited}
            steamRateLimitResetTime={getRateLimitResetTime()}
            onSteamSyncClick={handleSteamSync}
            onCreateClick={() => dispatch({ type: 'patch', payload: { ctaMode: 'create' } })}
            onSuggestionsClick={() =>
              dispatch({ type: 'patch', payload: { ctaMode: 'suggestions' } })
            }
            onExportClick={!isReadOnly ? handleExport : undefined}
            isReadOnly={isReadOnly}
          />

          {!isReadOnly && !isMobile && ctaMode === 'create' && (
            <CreateEntryPanel
              category={category}
              searchQuery={createQuery}
              onSearchChange={value => dispatch({ type: 'patch', payload: { createQuery: value } })}
              searchResults={createResults}
              isLoading={createLoading}
              onOpenDialog={openEntryDialog}
              onClose={() => dispatch({ type: 'patch', payload: { ctaMode: null } })}
              libraryEntries={libraryEntries}
            />
          )}

          <CategoryStats
            category={category}
            totalEntries={libraryEntries.length}
            activeStatus={activeStatus}
            onStatusChange={value => dispatch({ type: 'patch', payload: { activeStatus: value } })}
            counts={counts}
          />
        </section>

        <div className="px-1 sm:px-0">
          <StatusFilterBar
            category={category}
            search={search}
            onSearchChange={value => dispatch({ type: 'patch', payload: { search: value } })}
            activeStatus={activeStatus}
            onStatusChange={value => dispatch({ type: 'patch', payload: { activeStatus: value } })}
          />
        </div>

        {libraryError && (
          <div className="rounded-[20px] p-2 sm:p-3">
            <ErrorAlert message={libraryError} />
          </div>
        )}

        <div className="rounded-2xl border border-border/70 bg-card/40 p-3 sm:p-4">
          <LibraryEntryList
            category={category}
            entries={entries}
            isLoading={libraryLoading}
            activeStatus={activeStatus}
            onOpenDialog={openEntryDialog}
            onDelete={handleDeleteEntry}
            onToggleFavorite={handleToggleFavorite}
            onCreateClick={() => dispatch({ type: 'patch', payload: { ctaMode: 'create' } })}
            isReadOnly={isReadOnly}
            canToggleFavorite={canToggleFavorite}
          />
        </div>

        {!isReadOnly && (
          <EntryEditDialog
            entry={selectedEntry}
            category={category}
            onClose={() => dispatch({ type: 'patch', payload: { selectedEntry: null } })}
            onSave={handleSaveEntry}
            onDelete={handleDeleteEntry}
            onRefreshEntry={loadLibraryEntries}
          />
        )}
      </div>

      <Sheet
        open={!isReadOnly && isMobile && ctaMode === 'create'}
        onOpenChange={open => {
          dispatch({ type: 'patch', payload: { ctaMode: open ? 'create' : null } });
        }}
      >
        <SheetContent
          side="bottom"
          className="h-[100dvh] w-full max-w-none gap-0 border-x-0 border-b-0 border-t border-border bg-card p-0 md:hidden"
        >
          <div className="h-full overflow-y-auto px-3 py-4">
            <CreateEntryPanel
              category={category}
              searchQuery={createQuery}
              onSearchChange={value => dispatch({ type: 'patch', payload: { createQuery: value } })}
              searchResults={createResults}
              isLoading={createLoading}
              onOpenDialog={openEntryDialog}
              onClose={() => dispatch({ type: 'patch', payload: { ctaMode: null } })}
              libraryEntries={libraryEntries}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!isReadOnly && ctaMode === 'suggestions'}
        onOpenChange={open => {
          dispatch({ type: 'patch', payload: { ctaMode: open ? 'suggestions' : null } });
        }}
      >
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={
            isMobile
              ? 'h-[100dvh] w-full max-w-none gap-0 border-x-0 border-b-0 border-t border-border bg-card p-0'
              : 'w-full max-w-xl border-border/70 bg-card p-0'
          }
        >
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-border/70 px-4 py-4 sm:px-6 sm:py-5">
              <SheetTitle>Personal Suggestions</SheetTitle>
              <SheetDescription>Recommendations based on your taste profile.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <SuggestionsPanel
                category={category}
                suggestions={suggestions}
                isLoading={suggestionsLoading}
                onOpenDialog={openEntryDialog}
                libraryEntries={libraryEntries}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {steamSyncing && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm">
          <div className="modal-surface pointer-events-auto w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-lg font-semibold text-foreground">
                  Steam sync with IGDB metadata
                </p>
                <p className="text-sm text-muted-foreground">
                  {steamSyncProgress?.message ??
                    'Fetching metadata, cover images, and updating entries. Please wait...'}
                </p>
                {steamSyncProgress && steamSyncProgress.totalSteps > 0 && (
                  <p className="text-tertiary mt-1 text-xs">
                    Processing with IGDB free tier (rate limited for stability)
                  </p>
                )}
              </div>
              <span className="bg-surface-hover rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
                {statusLabel}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <span>Progress</span>
                <span>{normalizedProgressPercent}%</span>
              </div>
              <div className="bg-surface-base overflow-hidden rounded-full border border-border">
                <div
                  className="h-3 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.5)] transition-[width] duration-700 ease-out"
                  style={{ width: `${normalizedProgressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">{stepLabel}</span>
                {steamSyncProgress && steamSyncProgress.totalSteps > 0 && (
                  <span className="text-muted-foreground">
                    ~
                    {Math.ceil(
                      (steamSyncProgress.totalSteps - steamSyncProgress.completedSteps) * 0.5,
                    )}
                    s remaining
                  </span>
                )}
              </div>
            </div>
            {steamSyncProgress?.error && (
              <p className="mt-2 text-xs font-semibold text-destructive">
                Error: {steamSyncProgress.error}
              </p>
            )}
            {/* Live progress indicators during sync */}
            {steamSyncing && !steamSyncProgress?.result && steamSyncProgress?.message && (
              <div className="bg-surface-hover mt-4 rounded-2xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary"></div>
                  <p className="text-xs text-foreground">
                    {steamSyncProgress.message.includes('matching') ||
                    steamSyncProgress.message.includes('IGDB')
                      ? '🔍 Searching IGDB database...'
                      : steamSyncProgress.message.includes('metadata') ||
                          steamSyncProgress.message.includes('enrichment')
                        ? '📥 Fetching game metadata...'
                        : steamSyncProgress.message.includes('Catalog') ||
                            steamSyncProgress.message.includes('catalog')
                          ? '💾 Syncing with database...'
                          : steamSyncProgress.message.includes('Entries') ||
                              steamSyncProgress.message.includes('entries')
                            ? '✨ Creating user entries...'
                            : '⚙️ Processing...'}
                  </p>
                </div>
              </div>
            )}

            {/* Final results summary */}
            {steamSyncProgress?.result && (
              <div className="mt-4 space-y-3">
                <div className="bg-surface-hover grid gap-3 rounded-2xl border border-border p-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      Games
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {steamSyncProgress.result.totalFetched ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">from Steam</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      Imported
                    </p>
                    <p className="text-lg font-semibold" style={{ color: 'hsl(142 76% 36%)' }}>
                      {steamSyncProgress.result.mediaInserted ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">new entries</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      Updated
                    </p>
                    <p className="text-lg font-semibold text-primary">
                      {steamSyncProgress.result.mediaUpdated ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">existing</p>
                  </div>
                </div>

                {/* Show rejected games count if any */}
                {steamSyncProgress.result.rejectedGames &&
                  steamSyncProgress.result.rejectedGames.length > 0 && (
                    <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-warning">⚠️</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {steamSyncProgress.result.rejectedGames.length} games not found in IGDB
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            These games couldn&apos;t be matched with IGDB database and were
                            skipped. Try searching for them manually.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
