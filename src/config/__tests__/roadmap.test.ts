import { ROADMAP_ITEMS, getStatusLabel, type RoadmapItem } from '@/config/roadmap';

describe('roadmap config', () => {
  it('defines roadmap items with valid statuses, areas, and icons', () => {
    expect(ROADMAP_ITEMS).toHaveLength(16);
    expect(ROADMAP_ITEMS.every(item => item.icon != null)).toBe(true);
    expect(ROADMAP_ITEMS.every(item => item.title.length > 0)).toBe(true);
    expect(ROADMAP_ITEMS.every(item => item.description.length > 0)).toBe(true);
    expect(ROADMAP_ITEMS.map(item => item.status)).toEqual(
      expect.arrayContaining(['done', 'in-progress', 'planned']),
    );
    expect(ROADMAP_ITEMS.map(item => item.area)).toEqual(
      expect.arrayContaining(['core', 'community', 'dnd', 'import', 'ui', 'diary']),
    );
  });

  it('returns the correct labels for each status and context', () => {
    expect(getStatusLabel('done', 'teaser')).toBe('Done');
    expect(getStatusLabel('done', 'full')).toBe('Done');
    expect(getStatusLabel('in-progress', 'teaser')).toBe('In development');
    expect(getStatusLabel('in-progress', 'full')).toBe('In development');
    expect(getStatusLabel('planned', 'teaser')).toBe('Upcoming');
    expect(getStatusLabel('planned', 'full')).toBe('In roadmap');
  });

  it('includes the expected feature coverage by area', () => {
    const byArea = ROADMAP_ITEMS.reduce<Record<string, RoadmapItem[]>>((acc, item) => {
      acc[item.area] ??= [];
      acc[item.area].push(item);
      return acc;
    }, {});

    expect(byArea.core).toHaveLength(5);
    expect(byArea.community).toHaveLength(4);
    expect(byArea.dnd).toHaveLength(3);
    expect(byArea.import).toHaveLength(2);
    expect(byArea.ui).toHaveLength(1);
    expect(byArea.diary).toHaveLength(1);
  });
});
