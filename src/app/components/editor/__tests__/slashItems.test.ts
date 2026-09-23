import { filterSlashItems, SLASH_ITEMS } from '@/app/components/editor/slashItems';

describe('filterSlashItems', () => {
  it('returns everything for an empty query', () => {
    expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
    expect(filterSlashItems('   ')).toHaveLength(SLASH_ITEMS.length);
  });

  it('matches on the title', () => {
    expect(filterSlashItems('quote').map(item => item.id)).toEqual(['blockquote']);
  });

  it('matches on keywords the title does not contain', () => {
    expect(filterSlashItems('hr').map(item => item.id)).toContain('divider');
    expect(filterSlashItems('ul').map(item => item.id)).toContain('bulletList');
    expect(filterSlashItems('game').map(item => item.id)).toContain('mediaCard');
  });

  it('ranks title prefix matches above incidental matches', () => {
    // "Heading" starts with it; "Code block" only contains a keyword match.
    const ids = filterSlashItems('h').map(item => item.id);
    expect(ids[0]).toBe('heading2');
  });

  it('is case insensitive', () => {
    expect(filterSlashItems('QUOTE').map(item => item.id)).toEqual(['blockquote']);
  });

  it('returns nothing when there is no match', () => {
    expect(filterSlashItems('zzzzz')).toEqual([]);
  });

  it('exposes a stable, unique id for every item', () => {
    const ids = SLASH_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
