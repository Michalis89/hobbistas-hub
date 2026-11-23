import {
  canAccessSeriesStudio,
  canCreateSeries,
  canManageAllSeries,
  canManageSeries,
} from '../seriesAccess';

const as = (...roles: string[]) => ({ roles });

describe('series access rules', () => {
  it.each([
    ['author', true],
    ['reviewer', true],
    ['admin', true],
    ['owner', true],
    ['moderator', false],
    ['user', false],
  ])('%s can create: %s', (role, expected) => {
    expect(canCreateSeries(as(role))).toBe(expected);
  });

  it.each([
    ['admin', true],
    ['owner', true],
    ['moderator', true],
    ['author', false],
    ['reviewer', false],
    ['user', false],
  ])('%s manages all series: %s', (role, expected) => {
    expect(canManageAllSeries(as(role))).toBe(expected);
  });

  const series = { owner_id: 'u1' };

  it('an owner with an editorial role manages their own series only', () => {
    expect(canManageSeries(as('author'), 'u1', series)).toBe(true);
    expect(canManageSeries(as('author'), 'u2', series)).toBe(false);
  });

  it('an owner who lost every editorial role loses their own series', () => {
    expect(canManageSeries(as('user'), 'u1', series)).toBe(false);
    expect(canManageSeries(as(), 'u1', series)).toBe(false);
    expect(canManageSeries(null, 'u1', series)).toBe(false);
  });

  it('moderators, admins and owners manage any series, including ownerless ones', () => {
    for (const role of ['moderator', 'admin', 'owner']) {
      expect(canManageSeries(as(role), 'someone-else', series)).toBe(true);
      expect(canManageSeries(as(role), 'someone-else', { owner_id: null })).toBe(true);
    }
    expect(canManageSeries(as('author'), 'u1', { owner_id: null })).toBe(false);
  });

  it('Series Management is open to creators and to those who manage all series', () => {
    expect(canAccessSeriesStudio(as('author'))).toBe(true);
    expect(canAccessSeriesStudio(as('moderator'))).toBe(true);
    expect(canAccessSeriesStudio(as('user'))).toBe(false);
  });
});
