'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type SeriesEditorArticle = {
  id: number;
  title: string;
  status: string;
  author_id: string | null;
  assignedElsewhere: boolean;
};
export type SeriesEditorInitial = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  status: 'draft' | 'published';
  version: number;
  translation: { title: string; description: string | null } | null;
  chapterIds: number[];
};

const field = 'w-full rounded-md border border-border bg-background p-2 text-foreground';
export default function SeriesEditor({
  initial,
  articles,
}: {
  initial: SeriesEditorInitial | null;
  articles: SeriesEditorArticle[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [cover, setCover] = useState(initial?.cover_image ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [greekTitle, setGreekTitle] = useState(initial?.translation?.title ?? '');
  const [greekDescription, setGreekDescription] = useState(initial?.translation?.description ?? '');
  const [hasTranslation, setHasTranslation] = useState(Boolean(initial?.translation));
  const [chapters, setChapters] = useState(initial?.chapterIds ?? []);
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const byId = new Map(articles.map(article => [article.id, article]));
  async function send(url: string, method: string, body?: object) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Request failed');
    }
    return json.data;
  }
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const payload = { title, slug, description, cover_image: cover, status };
      const data = await send(
        initial ? `/api/series/${initial.id}` : '/api/series',
        initial ? 'PUT' : 'POST',
        payload,
      );
      const id = initial?.id ?? data.id;
      if (!initial) {
        setCreatedId(id);
      }
      if (greekTitle.trim()) {
        await send(`/api/series/${id}/translations`, 'PUT', {
          title: greekTitle,
          description: greekDescription,
        });
        setHasTranslation(true);
      } else if (hasTranslation) {
        await send(`/api/series/${id}/translations`, 'DELETE');
        setHasTranslation(false);
      }
      if (!initial) {
        router.replace(`/studio/series/${id}`);
        router.refresh();
      } else {
        setMessage('Series saved.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save series.');
    } finally {
      setBusy(false);
    }
  }
  async function saveChapters() {
    if (!initial) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await send(`/api/series/${initial.id}/chapters`, 'PUT', {
        version,
        article_ids: chapters,
      });
      setVersion(result.version);
      setMessage('Chapters saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save chapters.');
    } finally {
      setBusy(false);
    }
  }
  async function removeSeries() {
    if (!initial) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await send(`/api/series/${initial.id}`, 'DELETE');
      router.replace('/studio/series');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete series.');
      setBusy(false);
    }
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= chapters.length) {
      return;
    }
    const next = [...chapters];
    [next[index], next[target]] = [next[target], next[index]];
    setChapters(next);
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link href="/studio/series" className="text-primary">
        ← Series
      </Link>
      <h1 className="text-3xl font-bold">{initial ? 'Edit series' : 'Create series'}</h1>
      <div className="grid gap-4 rounded-xl border border-border bg-card p-5">
        <label>
          English title
          <input
            className={field}
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          Stable slug
          <input
            className={field}
            value={slug}
            onChange={e => setSlug(e.target.value)}
            disabled={!!initial}
            placeholder="my-series"
          />
        </label>
        <label>
          English description
          <textarea
            className={field}
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>
        <label>
          Cover image URL
          <input
            className={field}
            value={cover}
            onChange={e => setCover(e.target.value)}
            type="url"
          />
        </label>
        <label>
          Greek title
          <input
            className={field}
            value={greekTitle}
            onChange={e => setGreekTitle(e.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          Greek description
          <textarea
            className={field}
            value={greekDescription}
            onChange={e => setGreekDescription(e.target.value)}
            maxLength={2000}
          />
        </label>
        {initial && (
          <label>
            Status
            <select
              className={field}
              value={status}
              onChange={e => setStatus(e.target.value as 'draft' | 'published')}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        )}
        <button
          className="w-fit rounded-md bg-primary px-4 py-2 text-primary-foreground"
          disabled={busy || (!initial && createdId !== null)}
          onClick={() => void save()}
        >
          {initial ? 'Save metadata' : 'Create draft'}
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!initial && createdId !== null && (
        <p>The draft was created. <Link className="text-primary" href={`/studio/series/${createdId}`}>Open it to finish editing</Link>.</p>
      )}
      {initial && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Chapters</h2>
          <ol className="space-y-2">
            {chapters.map((id, index) => {
              const article = byId.get(id);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-3 rounded border border-border p-3"
                >
                  <span className="flex-1">
                    {index + 1}. {article?.title ?? 'Article unavailable'}{' '}
                    {article && <span className="text-muted-foreground">({article.status})</span>}
                  </span>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move chapter ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === chapters.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move chapter ${index + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setChapters(chapters.filter(value => value !== id))}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
          <label className="block">
            Search articles
            <input className={field} value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {articles
              .filter(
                article =>
                  !chapters.includes(article.id) &&
                  article.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map(article => (
                <li key={article.id} className="flex items-center justify-between gap-3">
                  <span>
                    {article.title}{' '}
                    <span className="text-muted-foreground">
                      ({article.status}
                      {article.assignedElsewhere ? ', already in another series' : ''})
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-primary"
                    disabled={article.assignedElsewhere}
                    onClick={() => setChapters([...chapters, article.id])}
                  >
                    Add
                  </button>
                </li>
              ))}
          </ul>
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            disabled={busy}
            onClick={() => void saveChapters()}
          >
            Save chapters
          </button>
        </section>
      )}
      {initial && (
        <section className="space-y-3">
          <button className="text-destructive" onClick={() => setConfirmDelete(true)}>
            Delete series
          </button>
          {confirmDelete && (
            <div role="alert">
              <p>Delete this series? Its articles will remain.</p>
              <button
                disabled={busy}
                onClick={() => void removeSeries()}
                className="mr-4 text-destructive"
              >
                Confirm deletion
              </button>
              <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
