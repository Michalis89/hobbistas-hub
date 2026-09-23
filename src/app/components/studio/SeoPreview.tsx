import { SITE_URL } from '@/config/site';

/** Roughly where Google truncates, in characters. */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 155;

type SeoPreviewProps = {
  readonly title: string;
  readonly description: string;
  readonly slug: string;
  readonly basePath: string;
};

const truncate = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;

function Counter({ used, limit }: { used: number; limit: number }) {
  const state = used === 0 ? 'empty' : used > limit ? 'over' : used > limit * 0.9 ? 'near' : 'ok';

  return (
    <span
      className={
        state === 'over'
          ? 'text-destructive'
          : state === 'near'
            ? 'text-warning'
            : 'text-muted-foreground'
      }
    >
      {used}/{limit}
    </span>
  );
}

/**
 * Approximates a search result so the author can see what a reader will
 * actually read before clicking, instead of guessing from two text fields.
 */
export default function SeoPreview({ title, description, slug, basePath }: SeoPreviewProps) {
  const displayHost = SITE_URL.replace(/^https?:\/\//, '');
  const displayTitle = title.trim() || 'Untitled article';
  const displayDescription =
    description.trim() ||
    'No description yet. Search engines will pick an arbitrary snippet from the body.';

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border bg-background/60 p-3">
        <p className="truncate text-[11px] text-muted-foreground">
          {displayHost}
          {basePath}/{slug || '...'}
        </p>
        <p className="mt-1 text-[15px] leading-snug text-[#8ab4f8]">
          {truncate(displayTitle, TITLE_LIMIT)}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {truncate(displayDescription, DESCRIPTION_LIMIT)}
        </p>
      </div>

      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">
          Title <Counter used={title.trim().length} limit={TITLE_LIMIT} />
        </span>
        <span className="text-muted-foreground">
          Description <Counter used={description.trim().length} limit={DESCRIPTION_LIMIT} />
        </span>
      </div>
    </div>
  );
}
