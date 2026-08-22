import { resolveEntrySaveMode } from '../CategoryLibrary';
import { supportsExternalApi } from '../types';
import type { MediaCategory } from '../types';

const ALL_CATEGORIES: MediaCategory[] = ['anime', 'manga', 'books', 'movies', 'tv', 'games'];

describe('resolveEntrySaveMode', () => {
  it('adds — not updates — a title already in media_items that the user has never tracked', () => {
    // Regression: local-first search returns a mediaId for titles already in the
    // database. Treating that as an existing entry sent the save down the PATCH
    // path, where the server has no row to update and answers 409.
    expect(resolveEntrySaveMode(true, { mediaId: 53, entryId: undefined })).toBe('add');
  });

  it('updates only when the user owns a library row', () => {
    expect(resolveEntrySaveMode(true, { mediaId: 53, entryId: 900 })).toBe('update');
  });

  it('adds a brand-new external result that has no mediaId yet', () => {
    expect(resolveEntrySaveMode(true, { payload: { title: 'Frieren' } })).toBe('add');
  });

  it('falls back to local-only when there is nothing to send', () => {
    expect(resolveEntrySaveMode(true, {})).toBe('local-only');
  });

  it('never calls the media API for a category without external support', () => {
    expect(resolveEntrySaveMode(false, { mediaId: 53, entryId: 900 })).toBe('local-only');
    expect(resolveEntrySaveMode(false, { payload: {} })).toBe('local-only');
  });

  it.each(ALL_CATEGORIES)(
    'routes an untracked local hit to add for %s',
    (category: MediaCategory) => {
      // supportsExternalApi is true for all six categories and CategoryLibrary is
      // shared between them, so the 409 was never anime-specific.
      expect(supportsExternalApi(category)).toBe(true);
      expect(resolveEntrySaveMode(supportsExternalApi(category), { mediaId: 1 })).toBe('add');
    },
  );
});
