import { randomBytes } from 'crypto';

const MAL_AUTHORIZE_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const MAL_ANIME_LIST_URL = 'https://api.myanimelist.net/v2/users/@me/animelist';
const MAL_MANGA_LIST_URL = 'https://api.myanimelist.net/v2/users/@me/mangalist';

export const MAL_OAUTH_STATE_COOKIE = 'mal-oauth-state';
export const MAL_OAUTH_VERIFIER_COOKIE = 'mal-oauth-verifier';
export const MAL_OAUTH_USER_COOKIE = 'mal-oauth-user';
export const MAL_OAUTH_CATEGORY_COOKIE = 'mal-oauth-category';

export type MalSyncCategory = 'anime' | 'manga';

/* ================================
   Types
================================ */

/**
 * Per-user list state. Never a source for `media_items` — see {@link MalAnimeListItem}.
 */
export type MalListStatus = {
  status:
    | 'watching'
    | 'reading'
    | 'completed'
    | 'on_hold'
    | 'dropped'
    | 'plan_to_watch'
    | 'plan_to_read'
    | string;
  num_episodes_watched?: number | null;
  num_chapters_read?: number | null;
  score?: number | null;
};

/**
 * One list row: the work, and this user's relationship to it.
 *
 * The split is the important part and is worth stating, because collapsing it is what caused the
 * manga chapter-total corruption. `node` is **shared entity metadata** — the same object for every
 * MAL user, and the only thing that may ever be written to `media_items`. `list_status` is **this
 * user's own reading state** and belongs exclusively in `user_media_entries`.
 *
 * `num_chapters` and `num_volumes` live on `node`; `num_chapters_read` lives on `list_status`. The
 * names are one word apart and the values are wildly different, which is precisely why both are
 * declared here rather than left implicit.
 */
export type MalAnimeListItem = {
  node: {
    id: number;
    title?: string | null;
    synopsis?: string | null;
    num_episodes?: number | null;
    /** Total chapters the series has published. Zero or absent when unknown or ongoing. */
    num_chapters?: number | null;
    /** Total volumes the series has published. Zero or absent when unknown or ongoing. */
    num_volumes?: number | null;
    media_type?: string | null;
    status?: string | null;
    start_date?: string | null;
    main_picture?: {
      large?: string | null;
      medium?: string | null;
    } | null;
    alternative_titles?: {
      en?: string | null;
      ja?: string | null;
      synonyms?: string[] | null;
    } | null;
    genres?: Array<{ id: number; name: string }> | null;
  };
  list_status: MalListStatus;
};

type MalTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  scope?: string;
};

type MalListResponse = {
  data?: MalAnimeListItem[];
  paging?: { next?: string | null };
};

/* ================================
   Helpers
================================ */

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * RFC 7636 compliant PKCE verifier
 * Allowed chars: A-Z a-z 0-9 - . _ ~
 * Length: 43–128
 */
function randomPkceVerifier(length = 96): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function requireEnv(name: 'MAL_CLIENT_ID' | 'MAL_CLIENT_SECRET' | 'MAL_REDIRECT_URI'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/* ================================
   OAuth config
================================ */

export function getMalOAuthConfig() {
  return {
    clientId: requireEnv('MAL_CLIENT_ID'),
    clientSecret: requireEnv('MAL_CLIENT_SECRET'),
    redirectUri: requireEnv('MAL_REDIRECT_URI'),
  };
}

/* ================================
   PKCE + OAuth URL
================================ */

export function generatePkceState() {
  const state = base64UrlEncode(randomBytes(32));
  const codeVerifier = randomPkceVerifier(96);
  const codeChallenge = codeVerifier;

  return { state, codeVerifier, codeChallenge };
}

export function buildMalAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): URL {
  const url = new URL(MAL_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  return url;
}

/* ================================
   Token handling
================================ */

async function requestToken(body: URLSearchParams): Promise<MalTokenResponse> {
  const response = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`MAL token request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as MalTokenResponse;
}

export async function exchangeMalAuthCode(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.codeVerifier,
  });

  return requestToken(body);
}

export async function refreshMalAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
  });

  return requestToken(body);
}

/* ================================
   MAL API
================================ */

export async function fetchMalList(
  accessToken: string,
  category: MalSyncCategory,
): Promise<MalAnimeListItem[]> {
  const fields = [
    'list_status',
    'num_episodes',
    'num_chapters',
    'num_volumes',
    'main_picture',
    'alternative_titles',
    'synopsis',
    'media_type',
    'start_date',
    'status',
    'genres',
  ].join(',');

  const results: MalAnimeListItem[] = [];
  const baseUrl = category === 'manga' ? MAL_MANGA_LIST_URL : MAL_ANIME_LIST_URL;
  let nextUrl: string | null = `${baseUrl}?limit=100&fields=${encodeURIComponent(fields)}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`MAL list fetch failed (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json()) as MalListResponse;
    results.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;
  }

  return results;
}

/* ================================
   Mapping
================================ */

export function mapMalStatusToBacklogStatus(
  status: string,
): 'planned' | 'current' | 'completed' | 'dropped' {
  if (status === 'watching' || status === 'reading' || status === 'on_hold') {
    return 'current';
  }
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'dropped') {
    return 'dropped';
  }
  return 'planned';
}
