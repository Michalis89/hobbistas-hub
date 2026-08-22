import {
  BarChart3,
  Bell,
  BookOpen,
  Download,
  FileText,
  Heart,
  Layers,
  ListTodo,
  MessageCircle,
  Palette,
  Plug,
  Scroll,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RoadmapStatus = 'done' | 'in-progress' | 'planned';
export type RoadmapArea = 'core' | 'community' | 'dnd' | 'import' | 'ui' | 'diary';

export type RoadmapItem = {
  title: string;
  description: string;
  status: RoadmapStatus;
  area: RoadmapArea;
  icon: LucideIcon;
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    title: 'Personal Library',
    description: 'Unified personal library for tracking hobbies across media.',
    status: 'done',
    area: 'core',
    icon: Layers,
  },
  {
    title: 'Progress & Status Tracking',
    description: 'Track progress, statuses, favorites, and completion per entry.',
    status: 'done',
    area: 'core',
    icon: ListTodo,
  },
  {
    title: 'Personal Statistics',
    description: 'Personal stats for time invested, completions, and activity.',
    status: 'done',
    area: 'core',
    icon: BarChart3,
  },
  {
    title: 'External Metadata Enrichment',
    description: 'Enrich entries with metadata and covers from external APIs when added.',
    status: 'done',
    area: 'core',
    icon: Plug,
  },
  {
    title: 'Personal Suggestions',
    description: 'Optional, context-based suggestions inside library and import flows.',
    status: 'done',
    area: 'core',
    icon: Sparkles,
  },
  {
    title: 'Light Mode',
    description: 'Light/dark theme switch across the entire app.',
    status: 'done',
    area: 'ui',
    icon: Palette,
  },
  {
    title: 'Library Import',
    description:
      'Import your Steam library with playtime, and your anime and manga from MyAnimeList.',
    status: 'done',
    area: 'import',
    icon: Download,
  },
  {
    title: 'Data Export',
    description: 'Export your personal library and history to common, portable formats.',
    status: 'in-progress',
    area: 'import',
    icon: Download,
  },

  {
    title: 'Articles, Comments & Likes (Optional)',
    description:
      'Editorial and interaction features available only when the Community module is enabled.',
    status: 'done',
    area: 'community',
    icon: Heart,
  },
  {
    title: 'Profiles & Social Graph (Optional)',
    description: 'Public profiles and follow relationships, available only with Community enabled.',
    status: 'in-progress',
    area: 'community',
    icon: Users,
  },
  {
    title: 'Notifications (Optional)',
    description: 'Activity notifications for community interactions when enabled.',
    status: 'done',
    area: 'community',
    icon: Bell,
  },
  {
    title: 'Direct Messages (Optional)',
    description: 'Private messaging between users when Community features are enabled.',
    status: 'in-progress',
    area: 'community',
    icon: MessageCircle,
  },
  {
    title: 'D&D Campaign Toolkit',
    description: 'DM-focused tools for managing campaigns, sessions, and game material.',
    status: 'planned',
    area: 'dnd',
    icon: Scroll,
  },
  {
    title: 'Rulebook Search (SRD & PDFs)',
    description: 'Search SRD content and personal PDFs without built-in reading tools.',
    status: 'planned',
    area: 'dnd',
    icon: Search,
  },
  {
    title: 'Character Sheets (Automation)',
    description: 'Automated character sheets with calculated stats and progression.',
    status: 'planned',
    area: 'dnd',
    icon: FileText,
  },
  {
    title: 'Diary Module',
    description:
      'Private personal journal for notes and reflection. Optional and disabled by default.',
    status: 'done',
    area: 'diary',
    icon: BookOpen,
  },
];

const COMMON_STATUS_LABELS: Record<'done' | 'in-progress', string> = {
  done: 'Done',
  'in-progress': 'In development',
};

const PLANNED_LABELS: Record<'teaser' | 'full', string> = {
  teaser: 'Upcoming',
  full: 'In roadmap',
};

export function getStatusLabel(status: RoadmapStatus, context: 'teaser' | 'full'): string {
  if (status === 'planned') {
    return PLANNED_LABELS[context];
  }
  return COMMON_STATUS_LABELS[status];
}
