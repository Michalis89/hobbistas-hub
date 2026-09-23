const revalidateTagMock = jest.fn();
const revalidatePathMock = jest.fn();

jest.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

describe('revalidateCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks sitemap stale when article content changes', async () => {
    const { revalidateCache } = await import('@/lib/cache/tags');

    revalidateCache.article(123);

    expect(revalidateTagMock).toHaveBeenCalledWith('articles', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/sitemap.xml');
  });
});
