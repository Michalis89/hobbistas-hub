import { canManageAllArticles } from '@/lib/roles';

/**
 * Must match public.can_manage_all_articles() in
 * supabase/migrations/20261123_rc060_staff_article_access.sql.
 */
describe('canManageAllArticles', () => {
  it.each(['admin', 'owner', 'moderator'])('%s manages every article', role => {
    expect(canManageAllArticles({ roles: ['user', role] })).toBe(true);
  });

  it.each(['user', 'author', 'reviewer'])('%s only manages their own', role => {
    expect(canManageAllArticles({ roles: ['user', role] })).toBe(false);
  });

  it('is false without roles', () => {
    expect(canManageAllArticles({ roles: [] })).toBe(false);
  });
});
