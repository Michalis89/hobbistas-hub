import React from 'react';
import Link from 'next/link';
import { ChevronDown, Dice5, Ellipsis } from 'lucide-react';
import type { User as UserEntity } from '@/types/user';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { AuthButtons } from './AuthButtons';
import { LibraryMenu } from './LibraryMenu';
import { NavItemContent, desktopLinkClass } from './navbar.helpers';
import { isHrefActive, type DndToolItem, type HobbyItem, type NavbarLinkItem } from './navbar.data';
import { ThemeToggleButton } from './ThemeToggleButton';
import { UserMenu } from './UserMenu';

type Theme = 'dark' | 'light';

type DesktopNavProps = {
  pathname: string;
  navItems: NavbarLinkItem[];
  hobbyItems: HobbyItem[];
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
  isThemeSaving: boolean;
};

export const DesktopNav = React.memo(function DesktopNav({
  pathname,
  navItems,
  hobbyItems,
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
  isThemeSaving,
}: DesktopNavProps) {
  const featureMoreItems = navItems.filter(
    item => item.feature === 'diary' || item.feature === 'articles' || item.feature === 'reviews',
  );
  const moreNavItems = featureMoreItems;
  const coreNavItems = navItems.filter(
    item => item.feature !== 'diary' && item.feature !== 'articles' && item.feature !== 'reviews',
  );
  const supportItem = coreNavItems.find(item => item.href === '/support') ?? null;
  const coreWithoutSupport = coreNavItems.filter(item => item.href !== '/support');
  const aboutIndex = coreWithoutSupport.findIndex(item => item.href === '/about');
  const coreBeforeAbout =
    aboutIndex >= 0 ? coreWithoutSupport.slice(0, aboutIndex) : coreWithoutSupport;
  const aboutItem = aboutIndex >= 0 ? coreWithoutSupport[aboutIndex] : null;
  const coreAfterAbout = aboutIndex >= 0 ? coreWithoutSupport.slice(aboutIndex + 1) : [];
  const showMoreMenu = moreNavItems.length > 0 || (dndEnabled && dndTools.length > 0);
  const moreHasActiveRoute =
    moreNavItems.some(item => isHrefActive(pathname, item.href)) || pathname.startsWith('/dnd');

  return (
    <div className="hidden w-full items-center gap-6 md:flex">
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <Menubar className="pointer-events-auto flex h-auto items-center justify-center gap-6 rounded-none border-0 bg-transparent p-0 text-foreground shadow-none">
          {coreBeforeAbout.map(item => (
            <MenubarMenu key={item.href}>
              <MenubarTrigger
                asChild
                className={desktopLinkClass(isHrefActive(pathname, item.href))}
              >
                <Link href={item.href}>
                  <NavItemContent icon={item.icon} label={item.label} />
                </Link>
              </MenubarTrigger>
            </MenubarMenu>
          ))}
          {aboutItem ? (
            <MenubarMenu key={aboutItem.href}>
              <MenubarTrigger
                asChild
                className={desktopLinkClass(isHrefActive(pathname, aboutItem.href))}
              >
                <Link href={aboutItem.href}>
                  <NavItemContent icon={aboutItem.icon} label={aboutItem.label} />
                </Link>
              </MenubarTrigger>
            </MenubarMenu>
          ) : null}
          {hobbyItems.length > 0 ? (
            <LibraryMenu hobbyItems={hobbyItems} pathname={pathname} />
          ) : null}
          {coreAfterAbout.map(item => (
            <MenubarMenu key={item.href}>
              <MenubarTrigger
                asChild
                className={desktopLinkClass(isHrefActive(pathname, item.href))}
              >
                <Link href={item.href}>
                  <NavItemContent icon={item.icon} label={item.label} />
                </Link>
              </MenubarTrigger>
            </MenubarMenu>
          ))}
          {showMoreMenu ? (
            <MenubarMenu>
              <MenubarTrigger className={`${desktopLinkClass(moreHasActiveRoute)} gap-2`}>
                <Ellipsis className="size-4" />
                <span>More</span>
                <ChevronDown className="ml-1 size-4 text-muted-foreground/90 transition-opacity duration-200" />
              </MenubarTrigger>
              <MenubarContent className="w-64 p-1.5 text-foreground">
                {moreNavItems.map(item => {
                  const Icon = item.icon;
                  const active = isHrefActive(pathname, item.href);
                  return (
                    <MenubarItem
                      key={item.href}
                      asChild
                      className="px-2.5 py-2 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color] duration-200 [transition-timing-function:var(--easing-default)] focus:bg-[hsl(var(--accent))/10] focus:text-foreground"
                    >
                      <Link
                        href={item.href}
                        className={active ? 'text-foreground' : 'text-muted-foreground'}
                      >
                        <NavItemContent icon={Icon} label={item.label} />
                      </Link>
                    </MenubarItem>
                  );
                })}
                {moreNavItems.length > 0 && dndEnabled && dndTools.length > 0 ? (
                  <MenubarSeparator className="my-1.5 bg-[var(--border)]" />
                ) : null}
                {dndEnabled && dndTools.length > 0 ? (
                  <MenubarSub>
                    <MenubarSubTrigger className="px-2.5 py-2 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color] duration-200 [transition-timing-function:var(--easing-default)] focus:bg-[hsl(var(--accent))/10] focus:text-foreground data-[state=open]:bg-[hsl(var(--accent))/10] data-[state=open]:text-foreground">
                      <NavItemContent icon={Dice5} label="D&D" />
                    </MenubarSubTrigger>
                    <MenubarSubContent className="w-64 p-1.5 text-foreground">
                      {dndTools.map(tool => {
                        const Icon = tool.icon;
                        const active = isHrefActive(pathname, tool.href);
                        return (
                          <MenubarItem
                            key={tool.href}
                            asChild
                            className="px-2.5 py-2 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,color] duration-200 [transition-timing-function:var(--easing-default)] focus:bg-[hsl(var(--accent))/10] focus:text-foreground"
                          >
                            <Link
                              href={tool.href}
                              className={active ? 'text-foreground' : 'text-muted-foreground'}
                            >
                              <NavItemContent icon={Icon} label={tool.label} />
                            </Link>
                          </MenubarItem>
                        );
                      })}
                    </MenubarSubContent>
                  </MenubarSub>
                ) : null}
              </MenubarContent>
            </MenubarMenu>
          ) : null}
          {supportItem ? (
            <MenubarMenu key={supportItem.href}>
              <MenubarTrigger
                asChild
                className={desktopLinkClass(isHrefActive(pathname, supportItem.href))}
              >
                <Link href={supportItem.href}>
                  <NavItemContent icon={supportItem.icon} label={supportItem.label} />
                </Link>
              </MenubarTrigger>
            </MenubarMenu>
          ) : null}
        </Menubar>
      </div>

      <div className="pointer-events-auto relative z-20 flex h-10 shrink-0 items-center gap-2 text-foreground">
        {!authResolved ? (
          <NavbarAuthSkeleton />
        ) : isAuthenticated && user ? (
          <>
            <ThemeToggleButton
              theme={theme}
              onToggle={onToggleTheme}
              disabled={isThemeSaving}
              className="h-8 w-8"
            />
            <UserMenu
              user={user}
              canAccessStudio={canAccessStudio}
              canAccessAdminPanel={canAccessAdminPanel}
              userTicketUnreadCount={userTicketUnreadCount}
              adminTicketUnreadCount={adminTicketUnreadCount}
              hasAnyTicketUnread={hasAnyTicketUnread}
              onOpenStudio={onOpenStudio}
              onLogout={onLogout}
            />
          </>
        ) : (
          <AuthButtons theme={theme} onToggleTheme={onToggleTheme} />
        )}
      </div>
    </div>
  );
});

function NavbarAuthSkeleton() {
  return (
    <div className="flex h-9 items-center gap-2">
      <div className="h-9 w-9 animate-pulse rounded-md bg-[hsl(var(--accent))/10]" />
      <div className="h-4 w-24 animate-pulse rounded bg-[hsl(var(--accent))/10]" />
      <div className="h-9 w-9 animate-pulse rounded-md bg-[hsl(var(--accent))/10]" />
    </div>
  );
}
