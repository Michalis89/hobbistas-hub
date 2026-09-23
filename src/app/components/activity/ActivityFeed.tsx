'use client';

import { memo, useState, useEffect, useMemo, createContext, useContext } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import {
  Clock,
  Gamepad2,
  Sparkles,
  User as UserIcon,
  Trophy as TrophyIcon,
  Flag,
  Heart,
  FileText,
  MessageSquare,
  Pencil,
  Trash2,
  Star,
} from 'lucide-react';
import { normalizeSlug } from '@/utils/slugify';
import { getActivityHref } from './activityHelpers';
import EmptyState from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { selectUser } from '@/store/slices/authSlice';
import { Button } from '@/components/ui/button';

type CategoryAlertState = {
  showCategoryAlert: (category: string) => void;
  userCategories: string[] | null;
};

const CategoryAlertContext = createContext<CategoryAlertState | null>(null);

type ActivityType =
  | 'backlog_added'
  | 'backlog_status'
  | 'media_added'
  | 'media_status'
  | 'media_favorite'
  | 'article_created'
  | 'article_updated'
  | 'article_deleted'
  | 'article_liked'
  | 'article_unliked'
  | 'article_comment'
  | 'article_commented'
  | 'article_comment_deleted';

export type ActivityItem = {
  id: number;
  user_id: string;
  type: ActivityType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
  created_at: string;
};

type ActivityFeedProps = {
  scope: 'global' | 'me';
  limit?: number;
  title?: string;
  compact?: boolean;
  height?: number;
  showHeader?: boolean;
  onActivitiesChange?: (activities: ActivityItem[]) => void;
};

const fetcher = (url: string) => fetch(url).then(res => res.json());

function timeAgo(date: string, now = Date.now()) {
  const then = new Date(date).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    return `${diffH}h ago`;
  }
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function RelativeTime({ date }: { date: string }) {
  const [now, setNow] = useState(() => Date.now());
  const relativeTime = timeAgo(date, now);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  return <span suppressHydrationWarning>{relativeTime}</span>;
}

function renderText(item: ActivityItem) {
  const p = item.payload || {};
  const name = p.display_name || p.username || 'User';
  const title = p.gameTitle || p.articleTitle || 'content';
  const category = (p.category || '').toString();
  const mediaTitle = p.title || title;
  const categoryWithArticle: Record<string, { article: string; label: string }> = {
    anime: { article: 'the', label: 'anime' },
    manga: { article: 'the', label: 'manga' },
    movies: { article: 'the', label: 'movie' },
    books: { article: 'the', label: 'book' },
    tv: { article: 'the', label: 'series' },
    games: { article: 'the', label: 'game' },
  };
  if (item.type === 'backlog_added') {
    return `${name} added to backlog: ${title}`;
  }
  if (item.type === 'backlog_status') {
    if (item.payload?.favoriteAction === 'added') {
      return `${name} favorited: ${title}`;
    }
    if (item.payload?.favoriteAction === 'removed') {
      return `${name} removed from favorites: ${title}`;
    }
    const status = (p.status || '').toString();
    const statusLabel: Record<string, string> = {
      platinumed: 'earned platinum',
      completed: 'completed',
      playing: 'is playing',
      to_play: 'added to backlog',
      dropped: 'dropped',
    };
    return `${name} ${statusLabel[status] || 'changed status to ' + status}: ${title}`;
  }
  if (item.type === 'media_added') {
    const cat = categoryWithArticle[category] || { article: 'the', label: 'media' };
    const status = (p.status || 'planned').toString();

    const isBook = category === 'books';
    const isGame = category === 'games';

    let currentVerb: string;
    let plannedVerb: string;

    if (isGame) {
      currentVerb = `is playing ${cat.article}`;
      plannedVerb = `added ${cat.article} ${cat.label} to backlog`;
    } else if (isBook) {
      currentVerb = `started reading ${cat.article}`;
      plannedVerb = `added ${cat.article}`;
    } else {
      currentVerb = `started watching ${cat.article}`;
      plannedVerb = `added ${cat.article}`;
    }

    const statusActions: Record<string, string> = {
      planned: plannedVerb,
      current: currentVerb,
      completed: `completed ${cat.article}`,
      dropped: `dropped ${cat.article}`,
    };
    const action = statusActions[status] || `added ${cat.article}`;
    if (isGame && status === 'planned') {
      return `${name} ${action}: ${mediaTitle}`;
    }
    return `${name} ${action} ${cat.label}: ${mediaTitle}`;
  }
  if (item.type === 'media_status') {
    const cat = categoryWithArticle[category] || { article: 'the', label: 'media' };
    const status = (p.status || '').toString();
    const isBook = category === 'books';
    const isGame = category === 'games';

    let currentVerb: string;
    let plannedVerb: string;

    if (isGame) {
      currentVerb = `is playing ${cat.article}`;
      plannedVerb = `added ${cat.article} ${cat.label} to backlog`;
    } else if (isBook) {
      currentVerb = `is reading ${cat.article}`;
      plannedVerb = `added ${cat.article}`;
    } else {
      currentVerb = `is watching ${cat.article}`;
      plannedVerb = `added ${cat.article}`;
    }

    const statusActions: Record<string, string> = {
      planned: plannedVerb,
      current: currentVerb,
      completed: `completed ${cat.article}`,
      dropped: `dropped ${cat.article}`,
    };

    if (isGame && status === 'planned') {
      return `${name} ${plannedVerb}: ${mediaTitle}`;
    }
    return `${name} ${statusActions[status] || 'changed status'} ${cat.label}: ${mediaTitle}`;
  }
  if (item.type === 'media_favorite') {
    const cat = categoryWithArticle[category] || { article: 'the', label: 'media' };
    const action = p.favoriteAction === 'removed' ? 'removed from favorites' : 'favorited';
    return `${name} ${action} ${cat.article} ${cat.label}: ${mediaTitle}`;
  }
  const isReview = p.topic === 'reviews';
  const contentType = isReview ? 'the review' : 'article';
  const contentTitle = p.articleTitle || (isReview ? 'review' : 'article');

  if (item.type === 'article_created') {
    return `${name} published ${contentType}: ${contentTitle}`;
  }
  if (item.type === 'article_updated') {
    return `${name} updated ${contentType}: ${contentTitle}`;
  }
  if (item.type === 'article_deleted') {
    return `${name} deleted ${contentType}: ${contentTitle}`;
  }
  if (item.type === 'article_liked') {
    return `${name} liked: ${contentTitle}`;
  }
  if (item.type === 'article_unliked') {
    return `${name} removed like from: ${contentTitle}`;
  }
  if (item.type === 'article_comment') {
    return `${name} commented on: ${contentTitle}`;
  }
  if (item.type === 'article_commented') {
    return `${name} commented on: ${contentTitle}`;
  }
  if (item.type === 'article_comment_deleted') {
    return `${name} deleted comment on: ${contentTitle}`;
  }
  return `${name} performed an action`;
}

function iconFor(item: ActivityItem) {
  if (item.type === 'backlog_added') {
    return <Gamepad2 className="h-4 w-4 text-primary" />;
  }
  if (item.type === 'backlog_status') {
    const status = (item.payload?.status || '').toString();
    if (status === 'platinumed') {
      return <TrophyIcon className="h-4 w-4 text-warning" />;
    }
    if (status === 'dropped') {
      return <Flag className="h-4 w-4 text-destructive" />;
    }
    if (status === 'playing') {
      return <Gamepad2 className="h-4 w-4 text-emerald-500" />;
    }
    if (item.payload?.favoriteAction === 'added') {
      return <Heart className="h-4 w-4 text-rose-500" />;
    }
    if (item.payload?.favoriteAction === 'removed') {
      return <Heart className="h-4 w-4 text-muted-foreground" />;
    }
    return <Gamepad2 className="h-4 w-4 text-primary" />;
  }
  if (item.type === 'media_added') {
    return <Sparkles className="h-4 w-4 text-primary" />;
  }
  if (item.type === 'media_status') {
    return <Gamepad2 className="h-4 w-4 text-emerald-500" />;
  }
  if (item.type === 'media_favorite') {
    return <Heart className="h-4 w-4 text-rose-500" />;
  }
  const isReview = item.payload?.topic === 'reviews';
  if (item.type === 'article_created') {
    return isReview ? (
      <Star className="h-4 w-4 text-warning" />
    ) : (
      <FileText className="h-4 w-4 text-primary" />
    );
  }
  if (item.type === 'article_updated') {
    return isReview ? (
      <Star className="h-4 w-4 text-warning" />
    ) : (
      <Pencil className="h-4 w-4 text-primary" />
    );
  }
  if (item.type === 'article_deleted') {
    return <Trash2 className="h-4 w-4 text-destructive" />;
  }
  if (item.type === 'article_liked') {
    return <Heart className="h-4 w-4 text-rose-500" />;
  }
  if (item.type === 'article_unliked') {
    return <Heart className="h-4 w-4 text-muted-foreground" />;
  }
  if (item.type === 'article_comment') {
    return <MessageSquare className="h-4 w-4 text-primary" />;
  }
  if (item.type === 'article_commented') {
    return <MessageSquare className="h-4 w-4 text-primary" />;
  }
  if (item.type === 'article_comment_deleted') {
    return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
  }
  return <UserIcon className="h-4 w-4 text-muted-foreground" />;
}

const categoryLabels: Record<string, string> = {
  anime: 'Anime',
  manga: 'Manga',
  movies: 'Movies',
  books: 'Books',
  tv: 'Series',
  games: 'Games',
};

function ActivityFeedComponent({
  scope,
  limit = 10,
  title,
  compact = false,
  height,
  showHeader = true,
  onActivitiesChange,
}: ActivityFeedProps) {
  const { data, error, isLoading } = useSWR(
    `/api/activity?scope=${scope}&limit=${limit}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const user = useSelector(selectUser);
  const userCategories = user?.category_profile
    ? Object.keys(user.category_profile).filter(key => key && typeof key === 'string')
    : null;

  const [alertCategory, setAlertCategory] = useState<string | null>(null);

  const showCategoryAlert = (category: string) => {
    setAlertCategory(category);
  };

  const activities: ActivityItem[] = useMemo(() => data?.activities ?? [], [data?.activities]);
  const feedTextClass = '  font-medium transition-colors hover:text-primary';

  useEffect(() => {
    onActivitiesChange?.(activities);
  }, [activities, onActivitiesChange]);

  return (
    <div className="p-4 sm:p-5">
      {/* Category access alert */}
      {alertCategory && (
        <Alert variant="info" className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>Category unavailable</AlertTitle>
          <AlertDescription>
            <span>
              You have not selected the category{' '}
              <strong>{categoryLabels[alertCategory] || alertCategory}</strong> in your profile.{' '}
              <Link
                href="/profile/edit#categories"
                className="font-semibold text-primary underline hover:opacity-85"
              >
                Add it here
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {showHeader && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title || 'Latest activity'}</h3>
          <div className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium">
            <Clock className="h-3.5 w-3.5" />
            <span>Live</span>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}
      {error && <ErrorAlert message="Failed to load activity. Please try again later." />}
      {!isLoading && !error && activities.length === 0 && (
        <EmptyState title="No recent activity." />
      )}

      <CategoryAlertContext.Provider value={{ showCategoryAlert, userCategories }}>
        <div
          className="space-y-2.5 overflow-y-auto pr-1"
          style={{ maxHeight: `${height ?? 360}px` }}
        >
          {activities.map(item => (
            <div
              key={item.id}
              className={`group flex items-start gap-3 rounded-[16px] border bg-card/80 p-3 ${
                compact ? 'text-sm' : 'text-base'
              }`}
            >
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-card">
                {iconFor(item)}
              </div>
              <div className="min-w-0 flex-1">
                <FeedText item={item} textClass={feedTextClass} />
                <p className="text-xs">
                  <RelativeTime date={item.created_at} />
                </p>
              </div>
            </div>
          ))}
        </div>
      </CategoryAlertContext.Provider>
    </div>
  );
}

export const ActivityFeed = memo(ActivityFeedComponent);
export function renderActivityText(item: ActivityItem) {
  return renderText(item);
}

function FeedText({ item, textClass }: { item: ActivityItem; textClass: string }) {
  const text = renderText(item);
  const payload = item.payload || {};
  const alertContext = useContext(CategoryAlertContext);

  if (
    (item.type === 'article_created' ||
      item.type === 'article_updated' ||
      item.type === 'article_liked' ||
      item.type === 'article_unliked' ||
      item.type === 'article_comment' ||
      item.type === 'article_commented' ||
      item.type === 'article_comment_deleted') &&
    payload.articleSlug
  ) {
    const articleSlug = normalizeSlug(payload.articleSlug as string);
    return (
      <Link href={`/articles/${articleSlug}`} className={textClass}>
        {text}
      </Link>
    );
  }

  if (item.type === 'backlog_status' || item.type === 'backlog_added') {
    const category = payload.category as string | undefined;
    const userCategories = alertContext?.userCategories ?? [];
    const hasCategory = !category || userCategories.includes(category);

    if (category && !hasCategory && alertContext?.showCategoryAlert) {
      return (
        <Button variant={'primary'} onClick={() => alertContext.showCategoryAlert(category)}>
          {text}
        </Button>
      );
    }

    const backlogUrl = `/backlog${category ? `?category=${category}` : ''}`;
    return (
      <Link href={backlogUrl} className={textClass}>
        {text}
      </Link>
    );
  }

  if (
    (item.type === 'media_added' ||
      item.type === 'media_status' ||
      item.type === 'media_favorite') &&
    payload.category
  ) {
    const category = payload.category as string;
    const userCategories = alertContext?.userCategories;
    const hasCategory = userCategories?.includes(category);

    if (!hasCategory && alertContext) {
      return (
        <Button variant={'primary'} onClick={() => alertContext.showCategoryAlert(category)}>
          {text}
        </Button>
      );
    }

    const href = getActivityHref(item);
    if (!href) {
      return <p className="font-medium">{text}</p>;
    }

    return (
      <Link href={href} className={textClass}>
        {text}
      </Link>
    );
  }
  return <p className="font-medium">{text}</p>;
}
