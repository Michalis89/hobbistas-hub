'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '@/store/store';
import { logout, selectNavbarAuth } from '@/store/slices/authSlice';
import { getLoginUrl, shouldRedirectToLogin } from '@/lib/routes/authRoutes';
import { useTheme } from '@/context/ThemeContext';
import { Skeleton } from '@/components/ui/skeleton';
import { DesktopNav } from './navbar/DesktopNav';
import { LogoBrand } from './navbar/LogoBrand';
import { MobileNavSheet } from './navbar/MobileNavSheet';
import {
  DND_TOOLS,
  getVisibleDndTools,
  getVisibleHobbyItems,
  getVisibleNavItems,
  HOBBY_ITEMS,
  type NavbarFeatureFilters,
} from './navbar/navbar.data';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { useTicketNotificationCount } from '@/lib/hooks/useTicketNotificationCount';


export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const isAuthRoute = pathname.startsWith('/auth/');
  const isHomeRoute = pathname === '/home';
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const currentFullPath = queryKey ? `${pathname}?${queryKey}` : pathname;
  const dispatch = useDispatch<AppDispatch>();
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    user,
    canAccessStudio,
    canAccessAdminPanel,
  } = useSelector(selectNavbarAuth);
  const { theme, themePreference, setThemePreference } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileClient, setIsMobileClient] = useState(false);
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

  useEffect(() => {
    setIsMobileClient(
      window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(hover: none)').matches,
    );
  }, []);

  const isDev = process.env.NODE_ENV === 'development';
  const isProd = process.env.NODE_ENV === 'production';
  const authResolved =
    isAuthRoute ||
    (isHomeRoute && isMobileClient) ||
    (!isAuthLoading && (!isAuthenticated || Boolean(user)));
  const logoHref = authResolved && isAuthenticated ? '/dashboard' : '/home';
  const userCategories = useMemo(
    () =>
      user?.category_profile
        ? Object.keys(user.category_profile).filter(key => key && typeof key === 'string')
        : [],
    [user?.category_profile],
  );

  const shouldLoadSettings = isAuthenticated && authResolved;
  const { settings, mutate: mutateSettings } = useUserSettings(shouldLoadSettings);
  const {
    userCount: userTicketUnreadCount,
    adminCount: adminTicketUnreadCount,
    totalCount: totalTicketUnreadCount,
  } = useTicketNotificationCount();
  const [isThemeSaving, setIsThemeSaving] = useState(false);

  const isNavbarLoading = !authResolved;
  const featureFilters = useMemo<NavbarFeatureFilters>(
    () => ({
      articles: settings?.articles_enabled ?? true,
      reviews: settings?.reviews_enabled ?? true,
      social_profile: isProd ? false : (settings?.social_profile_enabled ?? false),
      diary: settings?.diary_enabled ?? false,
      dnd: isProd ? false : (settings?.dnd_enabled ?? false),
      dnd_role: settings?.dnd_role ?? null,
    }),
    [
      isProd,
      settings?.articles_enabled,
      settings?.reviews_enabled,
      settings?.social_profile_enabled,
      settings?.diary_enabled,
      settings?.dnd_enabled,
      settings?.dnd_role,
    ],
  );

  const navItems = useMemo(
    () => getVisibleNavItems(isDev, isAuthenticated, authResolved, featureFilters),
    [isDev, isAuthenticated, authResolved, featureFilters],
  );
  const hobbyItems = useMemo(
    () =>
      getVisibleHobbyItems(
        HOBBY_ITEMS,
        authResolved,
        isAuthenticated,
        userCategories,
        featureFilters,
      ),
    [authResolved, isAuthenticated, userCategories, featureFilters],
  );

  const dndTools = useMemo(() => {
    if (!featureFilters.dnd) {
      return [];
    }
    return getVisibleDndTools(DND_TOOLS, featureFilters.dnd_role ?? null);
  }, [featureFilters.dnd, featureFilters.dnd_role]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, queryKey]);

  // Sync theme preference from user settings when loaded
  useEffect(() => {
    if (shouldLoadSettings && settings?.theme && settings.theme !== themePreference) {
      setThemePreference(settings.theme);
    }
  }, [shouldLoadSettings, settings?.theme, themePreference, setThemePreference]);

  const handleThemeToggle = useCallback(async () => {
    if (isThemeSaving) {
      return;
    }

    // Smart toggle logic:
    // - If preference is 'system', change to the opposite of current resolved theme
    // - If preference is explicit ('dark' or 'light'), toggle between them
    const nextPreference: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark';
    const previousPreference = themePreference;

    // Update theme preference in context (this will also update localStorage and cookies)
    setThemePreference(nextPreference);

    // If user is not authenticated, just update local state
    if (!shouldLoadSettings) {
      return;
    }

    const previousSettings = settings;
    setIsThemeSaving(true);

    // Optimistically update settings
    if (previousSettings) {
      mutateSettings({ ...previousSettings, theme: nextPreference }, false);
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: nextPreference }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to update theme setting');
      }

      if (payload?.data) {
        mutateSettings(payload.data, false);
      }
    } catch {
      // Rollback on error
      setThemePreference(previousPreference);
      if (previousSettings) {
        mutateSettings(previousSettings, false);
      }
    } finally {
      setIsThemeSaving(false);
    }
  }, [
    isThemeSaving,
    mutateSettings,
    setThemePreference,
    settings,
    shouldLoadSettings,
    theme,
    themePreference,
  ]);

  const handleLogout = async () => {
    await dispatch(logout());
    if (shouldRedirectToLogin(pathname)) {
      router.replace(getLoginUrl(currentFullPath));
    }
  };

  if (isNavbarLoading) {
    return <NavbarLoadingSkeleton isAdminRoute={isAdminRoute} />;
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/85 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
      <nav
        className={`relative mx-auto flex h-16 w-full items-center justify-between gap-3 px-3 sm:px-4 md:gap-4 md:px-10 ${
          isAdminRoute ? 'max-w-none' : 'max-w-screen-2xl'
        }`}
      >
        <LogoBrand href={logoHref} />

        <DesktopNav
          pathname={pathname}
          navItems={navItems}
          hobbyItems={hobbyItems}
          dndTools={dndTools}
          dndEnabled={featureFilters.dnd ?? false}
          authResolved={authResolved}
          isAuthenticated={isAuthenticated}
          user={user}
          canAccessStudio={canAccessStudio}
          canAccessAdminPanel={canAccessAdminPanel}
          userTicketUnreadCount={userTicketUnreadCount}
          adminTicketUnreadCount={adminTicketUnreadCount}
          hasAnyTicketUnread={totalTicketUnreadCount > 0}
          onOpenStudio={() => router.push('/studio')}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={handleThemeToggle}
          isThemeSaving={isThemeSaving}
        />

        <MobileNavSheet
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          pathname={pathname}
          hobbyItems={hobbyItems}
          navItems={navItems}
          dndTools={dndTools}
          dndEnabled={featureFilters.dnd ?? false}
          authResolved={authResolved}
          isAuthenticated={isAuthenticated}
          user={user}
          canAccessStudio={canAccessStudio}
          canAccessAdminPanel={canAccessAdminPanel}
          userTicketUnreadCount={userTicketUnreadCount}
          adminTicketUnreadCount={adminTicketUnreadCount}
          hasAnyTicketUnread={totalTicketUnreadCount > 0}
          onOpenStudio={() => router.push('/studio')}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={handleThemeToggle}
        />
      </nav>

    </header>
  );
}

function NavbarLoadingSkeleton({ isAdminRoute }: { isAdminRoute: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/85 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
      <div
        className={`mx-auto flex h-16 items-center justify-between gap-3 px-3 sm:px-4 md:gap-4 md:px-10 ${
          isAdminRoute ? 'max-w-none' : 'max-w-screen-2xl'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>

        <div className="hidden flex-1 px-8 md:block">
          <Skeleton className="mx-auto h-5 max-w-xl rounded" />
        </div>

        <div className="flex items-center gap-2.5">
          <Skeleton className="hidden h-9 w-9 rounded-md md:block" />
          <Skeleton className="h-9 w-9 rounded-md md:w-36" />
        </div>
      </div>
    </header>
  );
}
