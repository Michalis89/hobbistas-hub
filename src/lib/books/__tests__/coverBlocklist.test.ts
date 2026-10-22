import {
  BLOCKED_COVER_URLS,
  isBlockedCover,
  stripBlockedCoverFields,
  withoutBlockedCovers,
} from '../coverBlocklist';

const BLOCKED = 'https://assets.hardcover.app/edition/1/taken-down.jpeg';
const KEPT = 'https://covers.openlibrary.org/b/id/14627060-L.jpg';
const blocked = new Set([BLOCKED]);

describe('cover blocklist', () => {
  it('starts empty, so nothing is blocked until a notice is acted on', () => {
    expect(BLOCKED_COVER_URLS.size).toBe(0);
    expect(isBlockedCover(BLOCKED)).toBe(false);
  });

  it('matches exact URLs only', () => {
    expect(isBlockedCover(BLOCKED, blocked)).toBe(true);
    expect(isBlockedCover(`${BLOCKED}?w=200`, blocked)).toBe(false);
    expect(isBlockedCover(null, blocked)).toBe(false);
  });

  it('removes a blocked cover from a book candidate and keeps the rest', () => {
    expect(
      withoutBlockedCovers({ title: 'Homeland', coverLarge: BLOCKED, coverSmall: KEPT }, blocked),
    ).toEqual({ title: 'Homeland', coverLarge: null, coverSmall: KEPT });
  });

  it('returns the same object when nothing is blocked', () => {
    const book = { coverLarge: KEPT, coverSmall: KEPT };
    expect(withoutBlockedCovers(book, blocked)).toBe(book);
  });

  it('nulls blocked cover fields in a media_items payload', () => {
    expect(
      stripBlockedCoverFields(
        { title: 'Homeland', cover_image_large: BLOCKED, cover_image_medium: BLOCKED },
        blocked,
      ),
    ).toEqual({ title: 'Homeland', cover_image_large: null, cover_image_medium: null });
  });
});
