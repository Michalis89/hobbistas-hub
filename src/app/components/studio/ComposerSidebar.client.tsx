'use client';

import { useRef, useState } from 'react';
import { ImageIcon, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CoverThumbImage, THUMB_SIZES_SM } from '@/components/ui/cover-image';
import { uploadArticleCoverImage } from '@/lib/media/uploadArticleImage';
import type { ArticleCategory, ArticleTopic } from '@/types/database';
import {
  CATEGORIES,
  CONTENT_TYPES,
  availableCategoriesFor,
  availableTopicsFor,
  type ContentType,
  type MediaSearchItem,
} from '@/lib/articles/composerConfig';
import MediaLinkField from './MediaLinkField.client';
import SeoPreview from './SeoPreview';
import { slugify } from '@/utils/slugify';
import { toLocalDateTimeInput } from '@/lib/articles/draft';
import type { ComposerDraft } from './useArticleDraft';

const SELECT_CLASS =
  'w-full rounded-xl border border-border bg-card p-2.5 text-sm text-foreground transition hover:border-primary/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50';

const SECTION_TITLE_CLASS =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

const FIELD_LABEL_CLASS = 'text-xs font-medium text-foreground';

type ComposerSidebarProps = {
  readonly draft: ComposerDraft;
  readonly onChange: (patch: Partial<ComposerDraft>) => void;
  readonly canWriteArticles: boolean;
  readonly canWriteReviews: boolean;
};

export default function ComposerSidebar({
  draft,
  onChange,
  canWriteArticles,
  canWriteReviews,
}: ComposerSidebarProps) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const contentTypes = CONTENT_TYPES.filter(type =>
    type.value === 'article' ? canWriteArticles : canWriteReviews,
  );
  const categories = availableCategoriesFor(draft.type);
  const topics = availableTopicsFor(draft.category, draft.type);

  const handleTypeChange = (type: ContentType) => {
    // Re-selecting the current value still fires onChange. Bailing out here
    // matters because the branches below discard the linked media item.
    if (type === draft.type) {
      return;
    }

    const nextCategories = availableCategoriesFor(type);
    const keepsCategory = Boolean(draft.category && nextCategories.includes(draft.category));

    onChange({
      type,
      category: keepsCategory ? draft.category : '',
      topic: type === 'review' ? 'reviews' : 'articles',
      ...(type === 'article' ? { score: '' } : {}),
      // The link belongs to a category, so it only survives if the category does.
      ...(keepsCategory ? {} : { mediaId: null, linkedMediaTitle: null }),
    });
  };

  const handleCategoryChange = (category: ArticleCategory | '') => {
    if (category === draft.category) {
      return;
    }

    onChange({
      category,
      topic:
        draft.type === 'review'
          ? 'reviews'
          : category
            ? (CATEGORIES[category].topics[0]?.value ?? 'articles')
            : 'articles',
      // A link only makes sense within the category it was found in.
      mediaId: null,
      linkedMediaTitle: null,
    });
  };

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setCoverError(null);
    setIsUploadingCover(true);
    try {
      onChange({ coverImage: await uploadArticleCoverImage(file) });
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : 'Cover upload failed.');
    } finally {
      setIsUploadingCover(false);
    }
  };

  return (
    <aside className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className={SECTION_TITLE_CLASS}>Publishing</h2>

        {contentTypes.length > 1 && (
          <div className="space-y-1">
            <label className={FIELD_LABEL_CLASS} htmlFor="composer-type">
              Type
            </label>
            <select
              id="composer-type"
              className={SELECT_CLASS}
              value={draft.type}
              onChange={event => handleTypeChange(event.target.value as ContentType)}
            >
              {contentTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className={FIELD_LABEL_CLASS} htmlFor="composer-category">
            Category <span className="text-destructive">*</span>
          </label>
          <select
            id="composer-category"
            className={SELECT_CLASS}
            value={draft.category}
            onChange={event => handleCategoryChange(event.target.value as ArticleCategory | '')}
          >
            <option value="">-- Select --</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {CATEGORIES[category].label}
              </option>
            ))}
          </select>
        </div>

        {/*
          Only six of the nine categories have a single topic, and reviews are
          forced to "reviews", so the control is rendered only when there is an
          actual choice to make.
        */}
        {topics.length > 1 && (
          <div className="space-y-1">
            <label className={FIELD_LABEL_CLASS} htmlFor="composer-topic">
              Subcategory
            </label>
            <select
              id="composer-topic"
              className={SELECT_CLASS}
              value={draft.topic}
              onChange={event => onChange({ topic: event.target.value as ArticleTopic })}
            >
              {topics.map(topic => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/*
          Scheduling is offered only before an article goes live: re-scheduling
          something already published would just hide it again.
        */}
        {draft.status !== 'published' && (
          <div className="space-y-2">
            <label className={FIELD_LABEL_CLASS} htmlFor="composer-publish-when">
              Publish
            </label>
            <select
              id="composer-publish-when"
              className={SELECT_CLASS}
              value={draft.scheduledFor ? 'later' : 'now'}
              onChange={event =>
                onChange({
                  scheduledFor:
                    event.target.value === 'later'
                      ? // Default an hour out, so the value is already valid.
                        toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000).toISOString())
                      : '',
                })
              }
            >
              <option value="now">When I press publish</option>
              <option value="later">At a specific time</option>
            </select>

            {draft.scheduledFor && (
              <Input
                type="datetime-local"
                aria-label="Publish date and time"
                value={draft.scheduledFor}
                min={toLocalDateTimeInput(new Date().toISOString())}
                onChange={event => onChange({ scheduledFor: event.target.value })}
              />
            )}
          </div>
        )}

        {draft.type === 'review' && (
          <div className="space-y-1">
            <label className={FIELD_LABEL_CLASS} htmlFor="composer-score">
              Score <span className="text-muted-foreground">(0-10)</span>
            </label>
            <Input
              id="composer-score"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={draft.score}
              onChange={event => onChange({ score: event.target.value })}
            />
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className={SECTION_TITLE_CLASS}>Cover image</h2>

        {draft.coverImage ? (
          <div className="relative h-32 w-full overflow-hidden rounded-xl bg-muted">
            <CoverThumbImage
              src={draft.coverImage}
              alt="Cover preview"
              sizes={THUMB_SIZES_SM}
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
            <ImageIcon size={22} className="text-muted-foreground" />
          </div>
        )}

        <Input
          value={draft.coverImage}
          onChange={event => onChange({ coverImage: event.target.value })}
          placeholder="https://..."
          aria-label="Cover image URL"
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={isUploadingCover}
          onClick={() => coverInputRef.current?.click()}
        >
          {isUploadingCover ? <Spinner className="size-4" /> : <Upload size={16} />}
          {isUploadingCover ? 'Uploading...' : 'Upload cover'}
        </Button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={handleCoverUpload}
        />
        {coverError && <p className="text-xs text-destructive">{coverError}</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className={SECTION_TITLE_CLASS}>Connections</h2>

        <MediaLinkField
          category={draft.category}
          mediaId={draft.mediaId}
          linkedTitle={draft.linkedMediaTitle}
          onLink={(item: MediaSearchItem) =>
            onChange({ mediaId: item.mediaId, linkedMediaTitle: item.title })
          }
          onUnlink={() => onChange({ mediaId: null, linkedMediaTitle: null })}
        />

        <div className="space-y-1">
          <label className={FIELD_LABEL_CLASS} htmlFor="composer-tags">
            Tags <span className="text-muted-foreground">(comma separated)</span>
          </label>
          <Input
            id="composer-tags"
            value={draft.tags}
            onChange={event => onChange({ tags: event.target.value })}
            placeholder="jrpg, retrospective"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className={SECTION_TITLE_CLASS}>Search engines</h2>

        <div className="space-y-1">
          <label className={FIELD_LABEL_CLASS} htmlFor="composer-meta-title">
            Meta title
          </label>
          <Input
            id="composer-meta-title"
            value={draft.metaTitle}
            onChange={event => onChange({ metaTitle: event.target.value })}
            placeholder={draft.title || 'Defaults to the article title'}
          />
        </div>

        <div className="space-y-1">
          <label className={FIELD_LABEL_CLASS} htmlFor="composer-meta-description">
            Meta description
          </label>
          <Textarea
            id="composer-meta-description"
            rows={3}
            value={draft.metaDescription}
            onChange={event => onChange({ metaDescription: event.target.value })}
            placeholder={draft.description || 'Defaults to the article description'}
          />
          <SeoPreview
            title={draft.metaTitle || draft.title}
            description={draft.metaDescription || draft.description}
            slug={slugify(draft.title)}
            basePath={draft.type === 'review' ? '/review' : '/articles'}
          />
        </div>
      </section>
    </aside>
  );
}
