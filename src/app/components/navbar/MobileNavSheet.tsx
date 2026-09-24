import React from 'react';
import Link from 'next/link';
import {
  LogIn,
  LogOut,
  Menu,
  PenLine,
  PenSquare,
  Settings,
  ShieldCheck,
  Ticket,
  User,
  UserPlus,
} from 'lucide-react';
import type { User as UserEntity } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggleButton } from './ThemeToggleButton';
import { isHrefActive, type DndToolItem, type HobbyItem, type NavbarLinkItem } from './navbar.data';
import { mobileChipClass, NavItemContent } from './navbar.helpers';

type Theme = 'dark' | 'light';

type MobileNavSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  hobbyItems: HobbyItem[];
  navItems: NavbarLinkItem[];
  dndTools: DndToolItem[];
  dndEnabled: boolean;
  authResolved: boolean;
  isAuthenticated: boolean;
  user: UserEntity | null;
  canAccessStudio: boolean;
  canAccessAdminPanel: boolean;
  userTicketUnreadCount: number;
  adminTicketUnreadCount: number;
  hasAnyTicketUnread: boolean;
  onOpenStudio: () => void;
  onLogout: () => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
};

export const MobileNavSheet = React.memo(function MobileNavSheet({
  open,
  onOpenChange,
  pathname,
  hobbyItems,
  navItems,
  dndTools,
  dndEnabled,
  authResolved,
  isAuthenticated,
  user,
  canAccessStudio,
  canAccessAdminPanel,
  userTicketUnreadCount,
  adminTicketUnreadCount,
  hasAnyTicketUnread,
  onOpenStudio,
  onLogout,
  theme,
  onToggleTheme,
}: MobileNavSheetProps) {
  const closeSheet = () => onOpenChange(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const mobileHobbyItems = React.useMemo(
    () =>
      hobbyItems.filter(
        item => !['coding', 'pet', 'vape'].includes(item.label.trim().toLowerCase()),
      ),
    [hobbyItems],
  );

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="relative h-11 w-11 border border-[var(--border)] bg-card text-foreground transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
          >
            <Menu className="size-5" />
            {hasAnyTicketUnread ? (
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
            ) : null}
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="hb-dialog-surface h-[100dvh] w-full max-w-none touch-pan-y border-y-0 border-l border-r-0 border-border p-0 text-foreground sm:w-[92vw] sm:max-w-sm sm:border-y sm:border-r-0"
        >
          <SheetHeader className="px-5 py-4">
            <SheetTitle className="text-left text-sm font-semibold tracking-[-0.015em] text-foreground">
              Hobbistas Menu
            </SheetTitle>
          </SheetHeader>

          <div className="h-[calc(100dvh-72px)] overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
            <div className="space-y-4 pr-1">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick links
                </h3>
                <div className="grid gap-2">
                  {navItems.slice(0, 2).map(item => (
                    <Button
                      key={item.href}
                      asChild
                      variant="secondary"
                      className={mobileChipClass(isHrefActive(pathname, item.href), true)}
                    >
                      <Link href={item.href}>
                        <NavItemContent icon={item.icon} label={item.label} />
                      </Link>
                    </Button>
                  ))}
                </div>
              </section>

              {mobileHobbyItems.length > 0 ? (
                <>
                  <Separator className="h-[0.5px] bg-[var(--border)]" />

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Library
                    </h3>
                    <div className="-mx-1 touch-pan-x overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
                      <div className="flex w-max min-w-max gap-2">
                        {mobileHobbyItems.map(item => (
                          <Button
                            key={item.href}
                            asChild
                            variant="secondary"
                            className={mobileChipClass(isHrefActive(pathname, item.href))}
                          >
                            <Link href={item.href}>
                              <NavItemContent icon={item.icon} label={item.label} />
                            </Link>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              ) : null}

              {navItems.length > 2 && (
                <>
                  <Separator className="h-[0.5px] bg-[var(--border)]" />

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      More
                    </h3>
                    <div className="grid gap-2">
                      {navItems.slice(2).map(item => (
                        <Button
                          key={item.href}
                          asChild
                          variant="secondary"
                          className={mobileChipClass(isHrefActive(pathname, item.href), true)}
                        >
                          <Link href={item.href}>
                            <NavItemContent icon={item.icon} label={item.label} />
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {dndEnabled && dndTools.length > 0 && (
                <>
                  <Separator className="h-[0.5px] bg-[var(--border)]" />

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      D&D Tools
                    </h3>
                    <div className="-mx-1 touch-pan-x overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
                      <div className="flex w-max min-w-max gap-2">
                        {dndTools.map(tool => (
                          <Button
                            key={tool.href}
                            asChild
                            variant="secondary"
                            className={mobileChipClass(isHrefActive(pathname, tool.href))}
                          >
                            <Link href={tool.href}>
                              <NavItemContent icon={tool.icon} label={tool.label} />
                            </Link>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              )}

              <Separator className="h-[0.5px] bg-[var(--border)]" />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Appearance
                </h3>
                <ThemeToggleButton
                  theme={theme}
                  onToggle={onToggleTheme}
                  iconOnly={false}
                  className="w-full justify-start border-[var(--border)] bg-card px-3"
                />
              </section>

              <Separator className="h-[0.5px] bg-[var(--border)]" />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Account
                </h3>
                {!authResolved ? (
                  <NavbarAuthSkeletonMobile />
                ) : isAuthenticated && user ? (
                  <div className="grid gap-2">
                    {canAccessStudio ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 justify-start border border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                        onClick={() => {
                          closeSheet();
                          onOpenStudio();
                        }}
                      >
                        <PenSquare className="size-4" />
                        <span>Studio</span>
                      </Button>
                    ) : null}
                    <Button
                      asChild
                      variant="secondary"
                      className="h-11 justify-start border border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                    >
                      <Link href="/profile">
                        <User className="size-4" />
                        <span>Profile</span>
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className="h-11 justify-start border border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                    >
                      <Link href="/settings">
                        <Settings className="size-4" />
                        <span>Settings</span>
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className="h-11 justify-start border border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                    >
                      <Link href="/profile/edit">
                        <PenLine className="size-4" />
                        <span>Edit profile</span>
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className="h-11 justify-start border border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                    >
                      <Link href="/support/tickets">
                        <Ticket className="size-4" />
                        <span>My tickets</span>
                        {userTicketUnreadCount > 0 ? (
                          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-5 text-destructive-foreground">
                            {userTicketUnreadCount > 99 ? '99+' : userTicketUnreadCount}
                          </span>
                        ) : null}
                      </Link>
                    </Button>
                    {canAccessAdminPanel ? (
                      <Button
                        asChild
                        variant="secondary"
                        className="h-11 justify-start border border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                      >
                        <Link href="/admin">
                          <ShieldCheck className="size-4" />
                          <span>Admin Panel</span>
                          {adminTicketUnreadCount > 0 ? (
                            <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-5 text-destructive-foreground">
                              {adminTicketUnreadCount > 99 ? '99+' : adminTicketUnreadCount}
                            </span>
                          ) : null}
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start border-[var(--border)] bg-card px-3 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                      onClick={() => {
                        closeSheet();
                        void onLogout();
                      }}
                    >
                      <LogOut className="size-4" />
                      <span>Sign out</span>
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      asChild
                      variant="outline"
                      className="h-11 border-[var(--border)] bg-card text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:bg-[hsl(var(--accent))/10] active:scale-[0.98]"
                    >
                      <Link href="/auth/login">
                        <LogIn className="size-4" />
                        <span>Sign in</span>
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="primary"
                      className="h-11 border border-transparent bg-accent text-[13px] font-medium tracking-[-0.01em] transition-[filter,transform] duration-200 [transition-timing-function:var(--easing-default)] hover:brightness-110 active:scale-[0.98]"
                    >
                      <Link href="/auth/register">
                        <UserPlus className="size-4" />
                        <span>Create account</span>
                      </Link>
                    </Button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
});

function NavbarAuthSkeletonMobile() {
  return (
    <div className="grid gap-2">
      <div className="h-11 animate-pulse bg-[hsl(var(--accent))/10]" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-10 animate-pulse bg-[hsl(var(--accent))/10]" />
        <div className="h-10 animate-pulse bg-[hsl(var(--accent))/10]" />
      </div>
    </div>
  );
}
