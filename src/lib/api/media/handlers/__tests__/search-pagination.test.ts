/**
 * @jest-environment node
 */

const mockRange = jest.fn();
const mockCreateRouteHandlerClient = jest.fn();

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => mockCreateRouteHandlerClient(...args),
}));

import { handleMediaSearch, type MediaSearchConfig } from '../search';

type Item = { id: string };

const localRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, ext: `local-${index}` }));

function setupLocal(rows: Record<string, unknown>[]) {
  mockRange.mockResolvedValue({ data: rows, error: null });
  const builder = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    range: mockRange,
  };
  mockCreateRouteHandlerClient.mockResolvedValue({ from: () => builder });
}

const makeConfig = (
  fetchExternal: jest.Mock,
  paginated: boolean,
): MediaSearchConfig<'books', Item, Record<string, unknown>> => ({
  defaultCategory: 'books',
  supportedCategories: ['books'],
  limit: 2,
  paginated,
  logPrefix: 'Test',
  buildLocalOrFilter: query => `title.ilike.%${query}%`,
  mapLocalItem: item => ({ id: `local-${item.id}` }),
  mapExternalItem: item => ({ id: item.id }),
  getLocalExternalId: item => (item.ext as string) ?? null,
  getExternalId: item => item.id,
  fetchExternal,
});

const search = (config: MediaSearchConfig<'books', Item, Record<string, unknown>>, page?: number) =>
  handleMediaSearch(
    new Request(`http://localhost/api/books/search?q=dune${page ? `&page=${page}` : ''}`),
    config,
  ).then(response => response.json());

describe('handleMediaSearch pagination', () => {
  beforeEach(() => {
    mockRange.mockReset();
    mockCreateRouteHandlerClient.mockReset();
  });

  it('ignores ?page= for categories that are not paginated', async () => {
    setupLocal([]);
    const fetchExternal = jest.fn().mockResolvedValue([{ id: 'a' }]);

    const body = await search(makeConfig(fetchExternal, false), 3);

    expect(mockRange).toHaveBeenCalledWith(0, 1);
    expect(fetchExternal).toHaveBeenCalledWith('dune', { category: 'books', limit: 2, page: 1 });
    expect(body).not.toHaveProperty('hasMore');
  });

  it('pages the local query and the providers, and reports hasMore', async () => {
    setupLocal([]);
    const fetchExternal = jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const body = await search(makeConfig(fetchExternal, true), 2);

    expect(mockRange).toHaveBeenCalledWith(2, 3);
    expect(fetchExternal).toHaveBeenCalledWith('dune', { category: 'books', limit: 2, page: 2 });
    expect(body).toMatchObject({ page: 2, hasMore: true, items: [{ id: 'a' }, { id: 'b' }] });
  });

  it('keeps hasMore while the local page is full, even with no external call', async () => {
    setupLocal(localRows(2));
    const fetchExternal = jest.fn();

    const body = await search(makeConfig(fetchExternal, true));

    expect(fetchExternal).not.toHaveBeenCalled();
    expect(body).toMatchObject({ page: 1, hasMore: true });
  });

  it('stops when a later page is empty everywhere', async () => {
    setupLocal([]);
    const fetchExternal = jest.fn().mockResolvedValue([]);

    const body = await search(makeConfig(fetchExternal, true), 4);

    expect(body).toEqual({ source: 'external', items: [], page: 4, hasMore: false });
  });

  it('caps the page number', async () => {
    setupLocal([]);
    const fetchExternal = jest.fn().mockResolvedValue([]);

    await search(makeConfig(fetchExternal, true), 999);

    expect(fetchExternal.mock.calls[0][1]).toMatchObject({ page: 10 });
  });
});
