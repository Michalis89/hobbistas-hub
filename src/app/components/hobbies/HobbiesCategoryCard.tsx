'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Gamepad2,
  Sparkles,
  BookOpen,
  Film,
  Tv,
  Book,
  Code,
  PawPrint,
  Wind,
  ListTodo,
  FileText,
  Star,
  Lock,
  Construction,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import type { HobbyCategory } from '@/config/hobbies';
import { Button } from '@/components/ui/button';

const ICON_MAP: Record<string, typeof Gamepad2> = {
  Gamepad2,
  Sparkles,
  BookOpen,
  Film,
  Tv,
  Book,
  Code,
  PawPrint,
  Wind,
};

type ModuleButtonProps = {
  label: string;
  href: string;
  status: boolean | 'under-construction';
  requiresAuth: boolean;
  isAuthenticated: boolean;
  color: string;
  icon: typeof ListTodo;
};

function ModuleButton({
  label,
  href,
  status,
  requiresAuth,
  isAuthenticated,
  color,
  icon: Icon,
}: ModuleButtonProps) {
  const router = useRouter();

  const isUnderConstruction = status === 'under-construction';
  const isDisabled = status !== true;
  const disabledTitle = isUnderConstruction ? 'Under construction' : 'Unavailable';
  const needsLogin = requiresAuth && !isAuthenticated && status === true;

  const handleClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }

    if (needsLogin) {
      e.preventDefault();
      const redirectUrl = encodeURIComponent(href);
      router.push(`/auth/login?redirect=${redirectUrl}`);
      return;
    }
  };

  if (isDisabled) {
    return (
      <Button
        type="button"
        variant={'primary'}
        disabled
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
        title={disabledTitle}
      >
        <Construction className="h-3 w-3" />
        <span>{label}</span>
      </Button>
    );
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`group/btn flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${color}`}
    >
      {needsLogin ? <Lock className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
      <span>{label}</span>
    </Link>
  );
}

type HobbiesCategoryCardProps = {
  category: HobbyCategory;
};

export function HobbiesCategoryCard({ category }: HobbiesCategoryCardProps) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const IconComponent = ICON_MAP[category.icon] || Gamepad2;

  return (
    <div className="group rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/50 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
          <IconComponent className="h-6 w-6" />
        </div>
      </div>

      <h3 className="mb-1.5 text-lg font-semibold text-foreground">{category.title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{category.description}</p>

      <div className="flex flex-wrap gap-2">
        <ModuleButton
          label="Library"
          href={category.routes.backlog}
          status={category.modules.backlog}
          requiresAuth={category.requiresAuth.backlog}
          isAuthenticated={isAuthenticated}
          color="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
          icon={ListTodo}
        />
        <ModuleButton
          label="Articles"
          href={category.routes.news}
          status={category.modules.news}
          requiresAuth={category.requiresAuth.news}
          isAuthenticated={isAuthenticated}
          color="border-sky-500/30 bg-sky-500/10 text-sky-400 hover:border-sky-500/50 hover:bg-sky-500/20"
          icon={FileText}
        />
        <ModuleButton
          label="Reviews"
          href={category.routes.reviews}
          status={category.modules.reviews}
          requiresAuth={category.requiresAuth.reviews}
          isAuthenticated={isAuthenticated}
          color="border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/20"
          icon={Star}
        />
      </div>
    </div>
  );
}
