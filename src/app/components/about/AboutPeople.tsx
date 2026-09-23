import { AvatarImage } from '@/components/ui/avatar-image';
import { User2, MapPin, Gamepad2 } from 'lucide-react';

export type TeamMember = {
  id: string;
  username: string;
  display_name: string | null;
  roles: string[];
  bio: string | null;
  avatar_url: string | null;
  country: string | null;
  favorite_platform: string | null;
};

type AboutPeopleProps = {
  team: TeamMember[];
};

const roleLabel: Record<string, string> = {
  owner: 'Founder',
  admin: 'Admin',
  moderator: 'Moderator',
  author: 'Author',
  reviewer: 'Reviewer',
};

const roleColors: Record<string, string> = {
  owner: 'border-primary/60 text-primary',
  admin: 'border-primary/45 text-primary',
  moderator: 'border-sky-500/40 text-sky-400',
  reviewer: 'border-amber-500/40 text-amber-400',
  author: 'border-border text-muted-foreground',
};

const ROLE_PRIORITY = ['owner', 'admin', 'moderator', 'author', 'reviewer', 'user'];

const getDisplayRole = (member: TeamMember) => {
  const roles = Array.isArray(member.roles) ? member.roles : [];
  return ROLE_PRIORITY.find(role => roles.includes(role)) ?? 'user';
};

export function AboutPeople({ team }: AboutPeopleProps) {
  const sortedTeam = [...team].sort((a, b) => {
    const roleA = getDisplayRole(a);
    const roleB = getDisplayRole(b);
    const rankA = ROLE_PRIORITY.indexOf(roleA);
    const rankB = ROLE_PRIORITY.indexOf(roleB);
    if (rankA !== rankB) {
      return (
        (rankA === -1 ? ROLE_PRIORITY.length : rankA) -
        (rankB === -1 ? ROLE_PRIORITY.length : rankB)
      );
    }
    return (a.display_name || a.username).localeCompare(b.display_name || b.username, 'el');
  });

  return (
    <section className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center md:mb-14">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-primary">
            Who&apos;s behind this
          </p>
          <h2 className="mb-4 text-3xl font-semibold text-foreground md:text-4xl">
            Built by people who use it
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Hobbistas is made by a very small group of hobbyists, scratching our own itch first.
            There is no company behind it and no investors to answer to.
          </p>
        </div>

        {team.length === 0 ? null : (
          <div className="grid gap-5 sm:grid-cols-2">
            {sortedTeam.map(member => (
              <div
                key={member.id}
                className="group flex gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="relative h-16 w-16 shrink-0 rounded-xl bg-muted">
                  {member.avatar_url ? (
                    <AvatarImage
                      src={member.avatar_url}
                      alt={member.display_name || member.username}
                      className="rounded-xl"
                      size={64}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <User2 className="h-7 w-7" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {member.display_name || member.username}
                    </span>
                    {(() => {
                      const displayRole = getDisplayRole(member);
                      return (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            roleColors[displayRole] || roleColors.author
                          }`}
                        >
                          {roleLabel[displayRole] || displayRole}
                        </span>
                      );
                    })()}
                  </div>

                  {member.bio && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{member.bio}</p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="opacity-70">@{member.username}</span>
                    {member.country && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {member.country}
                      </span>
                    )}
                    {member.favorite_platform && (
                      <span className="flex items-center gap-1">
                        <Gamepad2 className="h-3 w-3" />
                        {member.favorite_platform}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
