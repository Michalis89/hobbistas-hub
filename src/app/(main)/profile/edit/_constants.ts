import { MessageCircle, Instagram, Youtube, Twitch, Twitter, Link2, Globe2 } from 'lucide-react';

export const SOCIAL_PLATFORMS = [
  {
    key: 'discord',
    label: 'Discord',
    icon: MessageCircle,
    placeholder: 'username#1234 or invite link',
  },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: '@handle or url' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'channel / video url' },
  { key: 'twitch', label: 'Twitch', icon: Twitch, placeholder: 'twitch.tv/...' },
  { key: 'twitter', label: 'X / Twitter', icon: Twitter, placeholder: '@handle or url' },
  { key: 'reddit', label: 'Reddit', icon: Link2, placeholder: 'reddit.com/u/...' },
  { key: 'website', label: 'Portfolio / Website', icon: Globe2, placeholder: 'https://...' },
];

/**
 * Used only when the runtime cannot enumerate zones itself, which in practice
 * means a browser older than the ones this app targets.
 */
const TIMEZONE_FALLBACK = [
  'Europe/Athens',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
];

/**
 * Every zone the platform knows about. The list used to be seven hardcoded
 * entries, which silently excluded most of the world from picking their own.
 */
function buildTimezones(): string[] {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone');
    if (supported && supported.length > 0) {
      return [...supported];
    }
  } catch {
    // Older runtimes throw on an unknown key rather than returning undefined.
  }
  return [...TIMEZONE_FALLBACK];
}

export const TIMEZONES = buildTimezones();

export const PRIMARY_HOBBY_CATEGORIES = [
  'games',
  'anime',
  'manga',
  'books',
  'movies',
  'tv',
] as const;

export const SOCIAL_LAYER_HOBBY_CATEGORIES = ['coding', 'pet', 'vape'] as const;
