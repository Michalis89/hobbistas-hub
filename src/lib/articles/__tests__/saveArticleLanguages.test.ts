import { saveArticleLanguages, type TranslationPanel } from '@/lib/articles/saveArticleLanguages';

function panel({
  title = 'Ελληνικός τίτλος',
  dirty = true,
  result = { ok: true } as Awaited<ReturnType<TranslationPanel['save']>>,
} = {}) {
  return {
    getTitle: jest.fn(() => title),
    isDirty: jest.fn(() => dirty),
    save: jest.fn(async () => result),
  };
}

/** An article that gets id 7 when saved (or already has it). */
function article({ id = null as number | null, ok = true } = {}) {
  let current = id;
  const order: string[] = [];
  return {
    order,
    getArticleId: () => current,
    saveArticle: jest.fn(async () => {
      order.push('article');
      if (ok) {
        current = current ?? 7;
      }
      return ok;
    }),
  };
}

describe('saveArticleLanguages: Save draft', () => {
  it('creates the article first, then saves Greek to the new id', async () => {
    const a = article();
    const t = panel();
    t.save.mockImplementation(async () => {
      a.order.push('greek');
      return { ok: true };
    });

    const result = await saveArticleLanguages({ ...a, translation: t });

    expect(a.order).toEqual(['article', 'greek']);
    expect(t.save).toHaveBeenCalledWith(7);
    expect(result).toEqual({ articleSaved: true, translation: 'saved', error: null });
  });

  it('does not touch Greek when it has no changes', async () => {
    const a = article({ id: 3 });
    const t = panel({ dirty: false });
    const result = await saveArticleLanguages({ ...a, translation: t });
    expect(t.save).not.toHaveBeenCalled();
    expect(result).toEqual({ articleSaved: true, translation: 'unchanged', error: null });
  });

  it('works without a Greek panel', async () => {
    const a = article({ id: 3 });
    expect(await saveArticleLanguages({ ...a, translation: null })).toEqual({
      articleSaved: true,
      translation: 'unchanged',
      error: null,
    });
  });

  it('saves nothing else when the article save fails', async () => {
    const a = article({ ok: false });
    const t = panel();
    const result = await saveArticleLanguages({ ...a, translation: t });
    expect(t.save).not.toHaveBeenCalled();
    expect(result).toEqual({ articleSaved: false, translation: 'failed', error: null });
  });

  it('says exactly what was saved when Greek fails after English', async () => {
    const a = article({ id: 3 });
    const t = panel({ result: { ok: false, error: 'Access forbidden' } });
    const result = await saveArticleLanguages({ ...a, translation: t });
    expect(result.articleSaved).toBe(true);
    expect(result.translation).toBe('failed');
    expect(result.error).toContain('English version was saved');
    expect(result.error).toContain('Access forbidden');
  });

  it('keeps Greek changes without a title unsaved and says why', async () => {
    const a = article({ id: 3 });
    const t = panel({ title: '  ' });
    const result = await saveArticleLanguages({ ...a, translation: t });
    expect(t.save).not.toHaveBeenCalled();
    expect(result.translation).toBe('needs-title');
    expect(result.error).toMatch(/needs a title/);
  });
});

describe('saveArticleLanguages: Publish', () => {
  it('saves pending Greek changes before publishing an existing article', async () => {
    const a = article({ id: 3 });
    const t = panel();
    t.save.mockImplementation(async () => {
      a.order.push('greek');
      return { ok: true };
    });
    const result = await saveArticleLanguages({ ...a, translation: t, publishing: true });
    expect(a.order).toEqual(['greek', 'article']);
    expect(result).toEqual({ articleSaved: true, translation: 'saved', error: null });
  });

  it('does not publish when the Greek save fails', async () => {
    const a = article({ id: 3 });
    const t = panel({ result: { ok: false, error: 'boom' } });
    const result = await saveArticleLanguages({ ...a, translation: t, publishing: true });
    expect(a.saveArticle).not.toHaveBeenCalled();
    expect(result.articleSaved).toBe(false);
    expect(result.error).toMatch(/^Not published/);
  });

  it('publishes directly when Greek has nothing pending', async () => {
    const a = article({ id: 3 });
    const t = panel({ dirty: false });
    const result = await saveArticleLanguages({ ...a, translation: t, publishing: true });
    expect(t.save).not.toHaveBeenCalled();
    expect(result).toEqual({ articleSaved: true, translation: 'unchanged', error: null });
  });
});
