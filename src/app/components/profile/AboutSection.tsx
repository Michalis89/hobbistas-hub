import { Globe2, Link2, MapPin, User, type LucideIcon } from 'lucide-react';
import type { User as UserType } from '@/types/user';
import type { ResolvedProfileIdentity } from './profileData';
import { getLocationLabel, getPrivacyValue } from './profileData';

type AboutSectionProps = {
  user: UserType;
  identity: ResolvedProfileIdentity | null;
};

function normalizeSocialUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

const SOCIAL_ORDER = [
  'website',
  'youtube',
  'twitter',
  'twitch',
  'instagram',
  'discord',
  'reddit',
] as const;

function toSocialLabel(key: string) {
  if (key === 'twitter') {
    return 'X / Twitter';
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function AboutSection({ user, identity }: Readonly<AboutSectionProps>) {
  const showSocial = getPrivacyValue(user, 'show_social_links', true);
  const showLocation = getPrivacyValue(user, 'show_location', true);
  const showEmail = getPrivacyValue(user, 'show_email', false);
  const socialLinks = (user.social_links ?? {}) as Record<string, unknown>;
  const location = getLocationLabel(user);
  const visibleSocials = showSocial
    ? [
        ...SOCIAL_ORDER.filter(key => {
          const value = socialLinks[key];
          return typeof value === 'string' && value.trim().length > 0;
        }),
        ...Object.keys(socialLinks).filter(
          key =>
            !SOCIAL_ORDER.includes(key as (typeof SOCIAL_ORDER)[number]) &&
            typeof socialLinks[key] === 'string' &&
            String(socialLinks[key]).trim().length > 0,
        ),
      ]
    : [];

  const details: Array<{ label: string; value: string; icon: LucideIcon }> = [
    identity?.fullName ? { label: 'Full Name', value: identity.fullName, icon: User } : null,
    user.timezone ? { label: 'Timezone', value: user.timezone, icon: Globe2 } : null,
    showLocation && location ? { label: 'Location', value: location, icon: MapPin } : null,
    showEmail && identity?.email ? { label: 'Email', value: identity.email, icon: Link2 } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; icon: LucideIcon }>;

  return (
    <section
      aria-labelledby="about-heading"
      className="rounded-3xl border border-border/60 bg-card/50 p-5 transition-colors hover:border-border sm:p-6"
    >
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Profile Story
        </p>
        <h2 id="about-heading" className="mt-1 text-xl font-semibold text-foreground">
          About
        </h2>
      </header>

      {details.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {details.map(item => (
            <div
              key={item.label}
              className="rounded-xl border border-border/50 bg-card/65 p-3 transition-colors hover:border-primary/30"
            >
              <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </p>
              <p className="break-all text-sm font-medium text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showSocial && visibleSocials.length > 0 && (
        <div className="mt-5 border-t border-border/40 pt-5">
          <p className="mb-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Social Links
          </p>
          <ul className="flex flex-wrap gap-2">
            {visibleSocials.map(key => {
              const href = normalizeSocialUrl(String(socialLinks[key]));
              return (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/65 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {toSocialLabel(key)}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
