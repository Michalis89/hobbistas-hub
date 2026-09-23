import {
  BookOpen,
  Code2,
  Clapperboard,
  Cloud,
  Film,
  Gamepad2,
  PawPrint,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { User } from '@/types/user';

export type ProfileCategoryKey =
  | 'games'
  | 'anime'
  | 'manga'
  | 'movies'
  | 'tv'
  | 'books'
  | 'coding'
  | 'pet'
  | 'vape';

export type CategoryGroup = 'Entertainment' | 'Creative' | 'Lifestyle';

export type CategoryMeta = {
  key: ProfileCategoryKey;
  title: string;
  description: string;
  group: CategoryGroup;
  icon: LucideIcon;
};

export type LabelValue = {
  label: string;
  value: string;
};

export type LabeledListSection = {
  label: string;
  items: string[];
};

export type ExternalAccount = {
  label: string;
  value: string;
  href?: string;
};

export type CategoryCardData = {
  keyAttributes: LabelValue[];
  genres: string[];
  listSections: LabeledListSection[];
  externalAccounts: ExternalAccount[];
  externalAccountsLabel?: string;
};

export type ResolvedProfileIdentity = {
  displayName: string;
  username: string;
  fullName: string;
  email: string;
  memberSince: string | null;
  lastLogin: string | null;
  emailVerified: boolean;
};

export const CATEGORY_META: Record<ProfileCategoryKey, CategoryMeta> = {
  games: {
    key: 'games',
    title: 'Games',
    description: 'Platforms, IDs, and play style',
    group: 'Entertainment',
    icon: Gamepad2,
  },
  anime: {
    key: 'anime',
    title: 'Anime',
    description: 'Formats, platforms, and favorites',
    group: 'Entertainment',
    icon: Sparkles,
  },
  manga: {
    key: 'manga',
    title: 'Manga',
    description: 'Reading style and genres',
    group: 'Entertainment',
    icon: BookOpen,
  },
  movies: {
    key: 'movies',
    title: 'Movies',
    description: 'Services and movie taste',
    group: 'Entertainment',
    icon: Film,
  },
  tv: {
    key: 'tv',
    title: 'TV',
    description: 'Services and binge patterns',
    group: 'Entertainment',
    icon: Tv,
  },
  books: {
    key: 'books',
    title: 'Books',
    description: 'Reading formats and genres',
    group: 'Entertainment',
    icon: BookOpen,
  },
  coding: {
    key: 'coding',
    title: 'Coding',
    description: 'Languages, tools, and stack',
    group: 'Creative',
    icon: Code2,
  },
  pet: {
    key: 'pet',
    title: 'Pet',
    description: 'Companion stories and details',
    group: 'Lifestyle',
    icon: PawPrint,
  },
  vape: {
    key: 'vape',
    title: 'Vape',
    description: 'Device and flavor preferences',
    group: 'Lifestyle',
    icon: Cloud,
  },
};

export const GROUP_ORDER: CategoryGroup[] = ['Entertainment', 'Creative', 'Lifestyle'];

export function getEnabledCategories(
  user: User | null,
  isPrivileged: boolean,
  socialLayerEnabled: boolean,
): ProfileCategoryKey[] {
  const fromProfile = user?.category_profile
    ? (Object.entries(user.category_profile)
        .filter(([key, value]) => isProfileCategoryKey(key) && hasCategoryData(value))
        .map(([key]) => key) as ProfileCategoryKey[])
    : [];

  const allOrdered = Object.keys(CATEGORY_META) as ProfileCategoryKey[];
  return allOrdered.filter(cat => {
    if (!socialLayerEnabled && ['coding', 'pet', 'vape'].includes(cat)) {
      return false;
    }
    return (
      fromProfile.includes(cat) || (isPrivileged && hasCategoryData(user?.category_profile?.[cat]))
    );
  });
}

export function getCategoryGroups(categories: ProfileCategoryKey[]) {
  return GROUP_ORDER.map(group => ({
    group,
    categories: categories.filter(category => CATEGORY_META[category].group === group),
  })).filter(item => item.categories.length > 0);
}

export function getPrivacyValue<T>(
  user: User,
  key:
    | 'show_age'
    | 'show_full_name'
    | 'show_location'
    | 'show_social_links'
    | 'show_stats'
    | 'show_email'
    | 'show_psn_id',
  defaultValue: T,
) {
  const privacy = (user.privacy_settings ?? {}) as Record<string, unknown>;
  const value = privacy[key];
  return (typeof value === 'boolean' ? value : defaultValue) as T;
}

export function getLocationLabel(user: User) {
  const parts = [user.location_city, user.country].filter(Boolean);
  return parts.join(', ');
}

export function resolveProfileIdentity(
  user: User,
  authUser?: SupabaseAuthUser | null,
): ResolvedProfileIdentity {
  const authMeta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    toText(user.display_name) || toText(user.full_name) || toText(authMeta.full_name);
  const username = toText(user.username) || toText(authMeta.username);
  const fullName = toText(user.full_name) || toText(authMeta.full_name);
  const email = toText(user.email) || toText(authUser?.email) || toText(authMeta.email);

  const emailVerified =
    typeof user.email_verified === 'boolean'
      ? user.email_verified
      : typeof authMeta.email_verified === 'boolean'
        ? authMeta.email_verified
        : Boolean(authUser?.email_confirmed_at);

  return {
    displayName: displayName || username || 'User',
    username: username || 'user',
    fullName,
    email,
    memberSince: user.created_at ?? authUser?.created_at ?? null,
    lastLogin: user.last_login ?? authUser?.last_sign_in_at ?? null,
    emailVerified,
  };
}

export function calculateAge(dateOfBirth?: string | null) {
  if (!dateOfBirth) {
    return null;
  }
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthday =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());

  if (!hasHadBirthday) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function summarizeItems(items: string[] | undefined, limit = 3) {
  if (!items?.length) {
    return {
      visible: [] as string[],
      extra: 0,
    };
  }
  const cleaned = items.filter(Boolean);
  return {
    visible: cleaned.slice(0, limit),
    extra: Math.max(0, cleaned.length - limit),
  };
}

function isProfileCategoryKey(value: string): value is ProfileCategoryKey {
  return value in CATEGORY_META;
}

function hasCategoryData(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value as Record<string, unknown>).some(item => {
    if (typeof item === 'string') {
      return item.trim().length > 0;
    }
    if (typeof item === 'number' || typeof item === 'boolean') {
      return true;
    }
    if (Array.isArray(item)) {
      return item.some(entry => String(entry).trim().length > 0);
    }
    if (item && typeof item === 'object') {
      return Object.keys(item).length > 0;
    }
    return false;
  });
}

export function getCategoryGenres(
  category: ProfileCategoryKey,
  note: Record<string, unknown> | undefined,
  genreAffinity?: Record<string, string[]>,
) {
  const affinity = genreAffinity?.[category] ?? [];
  if (affinity.length > 0) {
    return affinity;
  }

  if (category === 'games') {
    return ((note?.user_favorite_genres as string[]) || []).filter(Boolean);
  }

  return ((note?.genres as string[]) || []).filter(Boolean);
}

function toText(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function getSteamHref(steamId: string) {
  return `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}`;
}

function getPsnHref(psnId: string) {
  return `https://psnprofiles.com/${encodeURIComponent(psnId)}`;
}

function getMalHref(username: string) {
  return `https://myanimelist.net/profile/${encodeURIComponent(username)}`;
}

function toLabel(key: string) {
  const normalized = key.replace(/_/g, ' ').trim();
  if (!normalized) {
    return key;
  }
  return normalized
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toCsvList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number',
      )
      .map(item => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }
  return [];
}

function appendUnmappedFields(
  note: Record<string, unknown>,
  usedKeys: Set<string>,
  data: CategoryCardData,
) {
  for (const [key, value] of Object.entries(note)) {
    if (usedKeys.has(key) || value == null) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const textValue = String(value).trim();
      if (textValue) {
        data.keyAttributes.push({ label: toLabel(key), value: textValue });
      }
      continue;
    }

    if (Array.isArray(value)) {
      const items = value
        .filter((item): item is string | number | boolean =>
          ['string', 'number', 'boolean'].includes(typeof item),
        )
        .map(item => String(item).trim())
        .filter(Boolean);
      if (items.length > 0) {
        data.listSections.push({ label: toLabel(key), items });
      }
      continue;
    }

    if (typeof value === 'object') {
      data.keyAttributes.push({
        label: toLabel(key),
        value: JSON.stringify(value),
      });
    }
  }
}

export function getCategoryCardData(
  category: ProfileCategoryKey,
  note: Record<string, unknown>,
  genreAffinity?: Record<string, string[]>,
  options?: { showPsnId?: boolean },
): CategoryCardData {
  const text = (value: unknown) => {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return '';
  };
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  if (category === 'games') {
    const psnId = toText(note.psn_id);
    const steamId = toText(note.steam_id);
    const xboxGamertag = toText(note.xbox_gamertag);
    const nintendoId = toText(note.nintendo_id);

    const data: CategoryCardData = {
      keyAttributes: [],
      genres: getCategoryGenres(category, note, genreAffinity),
      listSections: [{ label: 'Favorite Platform', items: toCsvList(note.favorite_platform) }],
      externalAccountsLabel: 'Gaming Accounts',
      externalAccounts: [
        options?.showPsnId !== false && psnId
          ? { label: 'PSN ID', value: psnId, href: getPsnHref(psnId) }
          : null,
        steamId ? { label: 'Steam ID', value: steamId, href: getSteamHref(steamId) } : null,
        xboxGamertag ? { label: 'Xbox Gamertag', value: xboxGamertag } : null,
        nintendoId ? { label: 'Nintendo ID', value: nintendoId } : null,
      ].filter(Boolean) as ExternalAccount[],
    };

    appendUnmappedFields(
      note,
      new Set([
        'gaming_since',
        'favorite_platform',
        'user_favorite_genres',
        'psn_id',
        'steam_id',
        'xbox_gamertag',
        'nintendo_id',
      ]),
      data,
    );
    return data;
  }

  if (category === 'anime') {
    const malUsername = toText(note.mal_username);
    const data: CategoryCardData = {
      keyAttributes: [
        { label: 'Other Platform', value: text(note.platform_other) },
        { label: 'Notes', value: text(note.notes) },
      ],
      genres: getCategoryGenres(category, note, genreAffinity),
      listSections: [
        { label: 'Watching Format', items: toCsvList(note.format) },
        { label: 'Favorite Studios', items: toCsvList(note.favorite_studios) },
        { label: 'Platforms', items: list(note.platforms) },
      ],
      externalAccountsLabel: malUsername ? 'Anime Accounts' : undefined,
      externalAccounts: malUsername
        ? [{ label: 'MAL Username', value: malUsername, href: getMalHref(malUsername) }]
        : [],
    };
    appendUnmappedFields(
      note,
      new Set([
        'since',
        'format',
        'favorite_studios',
        'platform_other',
        'notes',
        'platforms',
        'genres',
        'mal_username',
      ]),
      data,
    );
    return data;
  }

  if (category === 'manga') {
    const malUsername = toText(note.mal_username);
    const data: CategoryCardData = {
      keyAttributes: [{ label: 'Notes', value: text(note.notes) }],
      genres: getCategoryGenres(category, note, genreAffinity),
      listSections: [
        { label: 'Reading Format', items: toCsvList(note.format) },
        { label: 'Favorite Authors', items: toCsvList(note.authors) },
      ],
      externalAccountsLabel: malUsername ? 'Manga Accounts' : undefined,
      externalAccounts: malUsername
        ? [{ label: 'MAL Username', value: malUsername, href: getMalHref(malUsername) }]
        : [],
    };
    appendUnmappedFields(
      note,
      new Set(['since', 'format', 'authors', 'notes', 'genres', 'mal_username']),
      data,
    );
    return data;
  }

  if (category === 'movies' || category === 'tv') {
    const data: CategoryCardData = {
      keyAttributes: [{ label: 'Other Service', value: text(note.service_other) }],
      genres: getCategoryGenres(category, note, genreAffinity),
      listSections: [
        {
          label: category === 'movies' ? 'Watching Style' : 'Series Style',
          items: toCsvList(note.style),
        },
        { label: 'Favorite Directors', items: toCsvList(note.directors) },
        { label: 'Favorite Actors', items: toCsvList(note.actors) },
        { label: 'Favorite People', items: toCsvList(note.people) },
        {
          label: category === 'movies' ? 'Streaming Services' : 'Platforms / Services',
          items: list(note.services),
        },
      ],
      externalAccounts: [],
    };
    appendUnmappedFields(
      note,
      new Set([
        'since',
        'style',
        'service_other',
        'directors',
        'actors',
        'people',
        'genres',
        'services',
      ]),
      data,
    );
    return data;
  }

  if (category === 'books') {
    const data: CategoryCardData = {
      keyAttributes: [{ label: 'Notes', value: text(note.notes) }],
      genres: getCategoryGenres(category, note, genreAffinity),
      listSections: [
        { label: 'Reading Format', items: toCsvList(note.format) },
        { label: 'Favorite Authors', items: toCsvList(note.authors) },
        { label: 'Languages', items: toStringArray(note.languages) },
      ],
      externalAccounts: [],
    };
    appendUnmappedFields(
      note,
      new Set(['since', 'format', 'authors', 'notes', 'genres', 'languages']),
      data,
    );
    return data;
  }

  if (category === 'coding') {
    const data: CategoryCardData = {
      keyAttributes: [
        { label: 'Tools / Stack', value: text(note.tools) },
        { label: 'Notes', value: text(note.notes) },
      ],
      genres: [],
      listSections: [
        { label: 'Languages', items: list(note.languages) },
        { label: 'Focus Areas', items: list(note.focus) },
      ],
      externalAccounts: [],
    };
    appendUnmappedFields(note, new Set(['since', 'tools', 'notes', 'languages', 'focus']), data);
    return data;
  }

  if (category === 'pet') {
    const data: CategoryCardData = {
      keyAttributes: [
        { label: 'Name', value: text(note.name) },
        { label: 'Type', value: text(note.type) },
        { label: 'Breed', value: text(note.breed) },
        { label: 'Stories', value: text(note.notes) },
      ],
      genres: [],
      listSections: [],
      externalAccounts: [],
    };
    appendUnmappedFields(note, new Set(['name', 'type', 'breed', 'since', 'notes']), data);
    return data;
  }

  if (category === 'vape') {
    const data: CategoryCardData = {
      keyAttributes: [
        { label: 'Device', value: text(note.device) },
        { label: 'Nicotine', value: text(note.nicotine) ? `${text(note.nicotine)} mg` : '' },
        { label: 'Notes', value: text(note.notes) },
      ],
      genres: [],
      listSections: [{ label: 'Flavors', items: list(note.flavors) }],
      externalAccounts: [],
    };
    appendUnmappedFields(note, new Set(['device', 'nicotine', 'since', 'notes', 'flavors']), data);
    return data;
  }

  const data: CategoryCardData = {
    keyAttributes: [] as LabelValue[],
    genres: [],
    listSections: [],
    externalAccounts: [],
  };
  appendUnmappedFields(note, new Set(), data);
  return data;
}

export const CONTENT_TOPIC_META: Record<string, { label: string; icon: LucideIcon }> = {
  articles: { label: 'Article', icon: Clapperboard },
  reviews: { label: 'Review', icon: Sparkles },
};
