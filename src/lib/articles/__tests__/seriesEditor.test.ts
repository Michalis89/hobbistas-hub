/** @jest-environment node */
import { errorResponse, isValidCoverUrl, managedSeries, seriesWriteStatus } from '../seriesEditor';
import { UnauthorizedError } from '@/lib/api/auth';

jest.mock('@/lib/supabase-route-handler', () => ({ createRouteHandlerClient: jest.fn() }));
jest.mock('@/lib/services/userService', () => ({ getUserFullInfo: jest.fn() }));

function dbReturning(row: unknown) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
  return {
    from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  } as never;
}

describe('series editor helpers', () => {
  it('answers 401 for a signed-out request, 500 otherwise', async () => {
    const unauthorized = errorResponse(new UnauthorizedError());
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('Cache-Control')).toContain('no-store');
    expect(errorResponse(new Error('boom')).status).toBe(500);
  });

  it('maps conflicts to 409 and never to a retryable 5xx', () => {
    expect(seriesWriteStatus('PT409')).toBe(409);
    expect(seriesWriteStatus('23505')).toBe(409);
    expect(seriesWriteStatus('40P01')).toBe(409);
    expect(seriesWriteStatus('40001')).toBe(409);
    expect(seriesWriteStatus('42501')).toBe(403);
    expect(seriesWriteStatus('P0002')).toBe(404);
    expect(seriesWriteStatus('22023')).toBe(400);
    expect(seriesWriteStatus(undefined)).toBe(500);
  });

  it('managedSeries hides a series from its owner once they lose their editorial role', async () => {
    const row = { id: 1, owner_id: 'u1' };
    await expect(managedSeries(dbReturning(row), 1, { roles: ['author'] }, 'u1')).resolves.toBe(
      row,
    );
    await expect(managedSeries(dbReturning(row), 1, { roles: ['user'] }, 'u1')).resolves.toBeNull();
    await expect(
      managedSeries(dbReturning(row), 1, { roles: ['author'] }, 'u2'),
    ).resolves.toBeNull();
    await expect(managedSeries(dbReturning(row), 1, { roles: ['moderator'] }, 'u2')).resolves.toBe(
      row,
    );
    await expect(
      managedSeries(dbReturning(null), 1, { roles: ['admin'] }, 'u2'),
    ).resolves.toBeNull();
  });

  it('accepts only https cover URLs', () => {
    expect(isValidCoverUrl(null)).toBe(true);
    expect(isValidCoverUrl('https://cdn.example/cover.jpg')).toBe(true);
    expect(isValidCoverUrl('http://cdn.example/cover.jpg')).toBe(false);
    expect(isValidCoverUrl('javascript:alert(1)')).toBe(false);
    expect(isValidCoverUrl('https://cdn.example/a b.jpg')).toBe(false);
  });
});
