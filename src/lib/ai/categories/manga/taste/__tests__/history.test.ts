/**
 * @jest-environment node
 *
 * The manga rows in this database are not what their column names claim, and these tests pin the
 * containment rather than the happy path. Each one corresponds to a specific write path in the
 * app; if any of those is repaired later, the test that describes its damage is where to look.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import { resolveChapterTotal, resolveProgressUnit } from '../history';

describe('chapter totals', () => {
  /**
   * The admin importer and the in-app search provider write `num_chapters` and `num_volumes` in
   * the same statement, so a genuine total always arrives with a volume count beside it.
   */
  it('trusts a chapter count that arrives with a volume count', () => {
    expect(resolveChapterTotal(162, 18)).toBe(162);
  });

  /**
   * The MAL OAuth sync writes `chapters: list_status.num_chapters_read` — the importing user's own
   * bookmark — and never writes `volumes`. The row is shared by every user via an upsert on
   * `(mal_id, category)`, so that number may belong to a stranger. Reading it as a denominator
   * would invent a completion ratio out of somebody else's reading position.
   */
  it('refuses a chapter count with no volume count beside it', () => {
    expect(resolveChapterTotal(47, null)).toBeNull();
    expect(resolveChapterTotal(47, 0)).toBeNull();
  });

  it('treats zero and negative counts as absent', () => {
    expect(resolveChapterTotal(0, 18)).toBeNull();
    expect(resolveChapterTotal(-5, 18)).toBeNull();
  });

  it('returns null when neither is recorded', () => {
    expect(resolveChapterTotal(null, null)).toBeNull();
  });

  /**
   * The cost of the rule above, stated as a test rather than left as a surprise.
   *
   * Most manhwa and webtoons publish in chapters only and MAL reports `num_volumes: 0` for them,
   * so a legitimate chapter total is discarded. That is the deliberate direction to fail in: a
   * missing total degrades the progress band to an honest absolute count, while a wrong total
   * produces a confident ratio that is fiction.
   */
  it('discards a real chapter-only total, which is the accepted cost of the rule', () => {
    expect(resolveChapterTotal(179, null)).toBeNull();
  });
});

describe('progress units', () => {
  it('reads a MAL-imported row as chapters', () => {
    // The sync writes `num_chapters_read` into progress.
    expect(resolveProgressUnit('mal', 250)).toBe('chapters');
  });

  it('reads a hand-managed row as volumes', () => {
    // The edit dialog labels the field "Volumes" and clamps it against the volume total.
    expect(resolveProgressUnit(null, 12)).toBe('volumes');
    expect(resolveProgressUnit('manual', 12)).toBe('volumes');
  });

  it('reports no unit when there is no progress to attach one to', () => {
    expect(resolveProgressUnit('mal', null)).toBe('unknown');
    expect(resolveProgressUnit('mal', 0)).toBe('unknown');
    expect(resolveProgressUnit(null, null)).toBe('unknown');
  });
});
