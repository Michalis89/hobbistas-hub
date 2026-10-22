import 'server-only';

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type CachedExternalFetchParams = {
  apiName: string;
  endpoint: string;
  ttlSeconds?: number;
  init?: RequestInit;
  /**
   * Replaces the global fetch for this call, e.g. for a host whose TLS chain
   * needs an extra CA certificate. Not part of the cache key.
   */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
};

export class ExternalFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ExternalFetchError';
    this.status = status;
  }
}

type ApiCacheRow = {
  key: string;
  data: unknown;
  expires_at: string;
};

let tableMissingLogged = false;

function getCacheClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function hashCacheKey(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function stringifyRequestInit(init?: RequestInit): string {
  if (!init) {
    return '';
  }

  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? init.body : '';
  return JSON.stringify({ method, body });
}

function shouldIgnoreCacheError(errorCode?: string) {
  // 42P01 = relation does not exist
  return errorCode === '42P01';
}

export async function cachedExternalFetch<T>({
  apiName,
  endpoint,
  ttlSeconds = 24 * 60 * 60,
  init,
  fetchImpl,
}: CachedExternalFetchParams): Promise<T> {
  const cacheClient = getCacheClient();
  const cacheKey = `${apiName}:${hashCacheKey(`${endpoint}:${stringifyRequestInit(init)}`)}`;

  if (cacheClient) {
    const { data: cached, error: cacheReadError } = await cacheClient
      .from('api_cache')
      .select('key,data,expires_at')
      .eq('key', cacheKey)
      .maybeSingle<ApiCacheRow>();

    if (!cacheReadError && cached) {
      const expiresAt = new Date(cached.expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        return cached.data as T;
      }
    } else if (cacheReadError && !shouldIgnoreCacheError(cacheReadError.code)) {
      console.warn(`[external-cache] cache read failed (${apiName}):`, cacheReadError.message);
    } else if (cacheReadError && !tableMissingLogged) {
      tableMissingLogged = true;
      console.warn('[external-cache] api_cache table not found; continuing without DB cache.');
    }
  }

  const response = await (fetchImpl ?? fetch)(endpoint, init);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new ExternalFetchError(
      `[${apiName}] request failed (${response.status}): ${bodyText}`,
      response.status,
    );
  }

  const payload = (await response.json()) as T;

  if (cacheClient) {
    const expiresAtIso = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error: cacheWriteError } = await cacheClient.from('api_cache').upsert({
      key: cacheKey,
      data: payload,
      expires_at: expiresAtIso,
    });

    if (cacheWriteError && !shouldIgnoreCacheError(cacheWriteError.code)) {
      console.warn(`[external-cache] cache write failed (${apiName}):`, cacheWriteError.message);
    } else if (cacheWriteError && !tableMissingLogged) {
      tableMissingLogged = true;
      console.warn('[external-cache] api_cache table not found; continuing without DB cache.');
    }
  }

  return payload;
}
