/**
 * @jest-environment node
 */
const redirectMock = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const createRouteHandlerClientMock = jest.fn();

jest.mock('next/navigation', () => ({ redirect: (path: string) => redirectMock(path) }));
jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: () => createRouteHandlerClientMock(),
}));

import { requireStudioAccess } from '@/lib/articles/studioAccess';

function signedInAs(roles: string[] | null) {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: roles ? { roles } : null, error: null }),
  };
  createRouteHandlerClientMock.mockResolvedValue({
    auth: {
      getSession: async () => ({
        data: { session: roles ? { user: { id: 'caller' } } : null },
      }),
    },
    from: () => query,
  });
}

describe('requireStudioAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends a signed-out visitor to log in', async () => {
    signedInAs(null);
    await expect(requireStudioAccess()).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login?redirect=/studio',
    );
  });

  it('keeps a plain user out', async () => {
    signedInAs(['user']);
    await expect(requireStudioAccess()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it.each([
    { role: 'author', canCreate: true, canManageAllContent: false },
    { role: 'reviewer', canCreate: true, canManageAllContent: false },
    { role: 'moderator', canCreate: false, canManageAllContent: true },
    { role: 'admin', canCreate: true, canManageAllContent: true },
    { role: 'owner', canCreate: true, canManageAllContent: true },
  ])('$role: create $canCreate, manage all $canManageAllContent', async expected => {
    signedInAs(['user', expected.role]);
    await expect(requireStudioAccess()).resolves.toMatchObject({
      canCreate: expected.canCreate,
      canManageAllContent: expected.canManageAllContent,
    });
  });
});
