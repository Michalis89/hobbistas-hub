import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';

export type SearchSource = 'local' | 'external' | 'mixed';
export type SearchExternalId = number | string;
export type SearchLocalItem = Record<string, unknown>;

type SearchFetchContext<TCategory extends string> = {
  category: TCategory;
  limit: number;
  /** 1-based; always 1 unless the config is `paginated`. */
  page: number;
};

/** Upper bound on ?page=, so a crawler cannot walk providers indefinitely. */
const MAX_SEARCH_PAGE = 10;

export type MediaSearchConfig<TCategory extends string, TExternalItem, TResultItem> = {
  defaultCategory: TCategory;
  supportedCategories: readonly TCategory[];
  limit?: number;
  /**
   * Honour ?page= by passing it to fetchExternal and paging the local query.
   * Only for categories whose providers all page; the others would return
   * the same external results for every page.
   */
  paginated?: boolean;
  logPrefix: string;
  buildLocalOrFilter: (query: string) => string;
  mapLocalItem: (item: SearchLocalItem) => TResultItem;
  mapExternalItem: (item: TExternalItem, category: TCategory) => TResultItem;
  getLocalExternalId: (item: SearchLocalItem) => SearchExternalId | null;
  getExternalId: (item: TExternalItem) => SearchExternalId;
  /**
   * Optional multi-key identity, for categories whose items can be known by
   * more than one id (books: Google Books id, Open Library id, ISBN). When
   * set, an external result is dropped if any of its keys matches any key
   * of a local item. Both sides must use the same key format.
   */
  getLocalExternalIds?: (item: SearchLocalItem) => SearchExternalId[];
  getExternalIds?: (item: TExternalItem) => SearchExternalId[];
  fetchExternal: (
    query: string,
    context: SearchFetchContext<TCategory>,
  ) => Promise<TExternalItem[]>;
  normalizeSearchTerm?: (value: string) => string;
  shouldIncludeLocalItem?: (item: SearchLocalItem) => boolean;
  shouldIncludeExternalItem?: (item: TExternalItem) => boolean;
};

function resolveSource(localCount: number, externalCount: number): SearchSource {
  if (localCount > 0 && externalCount > 0) {
    return 'mixed';
  }
  if (localCount > 0) {
    return 'local';
  }
  return 'external';
}

async function fetchWithNormalization<TCategory extends string, TExternalItem>(
  query: string,
  category: TCategory,
  limit: number,
  page: number,
  normalize: ((value: string) => string) | undefined,
  fetchExternal: (
    search: string,
    context: SearchFetchContext<TCategory>,
  ) => Promise<TExternalItem[]>,
) {
  let items = await fetchExternal(query, { category, limit, page });
  const normalized = normalize?.(query);

  if (
    items.length === 0 &&
    typeof normalized === 'string' &&
    normalized.length > 0 &&
    normalized !== query
  ) {
    items = await fetchExternal(normalized, { category, limit, page });
  }

  return items;
}

export async function handleMediaSearch<TCategory extends string, TExternalItem, TResultItem>(
  req: Request,
  config: MediaSearchConfig<TCategory, TExternalItem, TResultItem>,
): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    const category = (searchParams.get('category') || config.defaultCategory) as TCategory;
    const limit = config.limit ?? 12;
    const requestedPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const page = config.paginated
      ? Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), MAX_SEARCH_PAGE)
      : 1;

    if (!q) {
      return NextResponse.json({ source: 'local' as SearchSource, items: [] as TResultItem[] });
    }

    if (!config.supportedCategories.includes(category)) {
      return NextResponse.json({ error: 'Unsupported category' }, { status: 400 });
    }

    const supabase = await createRouteHandlerClient();
    const localOffset = (page - 1) * limit;
    const { data: localItems, error: localError } = await supabase
      .from('media_items')
      .select('*')
      .eq('category', category)
      .or(config.buildLocalOrFilter(q))
      .range(localOffset, localOffset + limit - 1);

    if (localError) {
      console.warn(`Local ${config.logPrefix.toLowerCase()} search error:`, localError);
    }

    const typedLocalItemsRaw = (localItems as SearchLocalItem[] | null) ?? [];
    const typedLocalItems = config.shouldIncludeLocalItem
      ? typedLocalItemsRaw.filter(config.shouldIncludeLocalItem)
      : typedLocalItemsRaw;
    const localResults = typedLocalItems.map(config.mapLocalItem);
    const remaining = Math.max(limit - localResults.length, 0);
    const localExternalIds = new Set(
      typedLocalItems.flatMap(item =>
        config.getLocalExternalIds
          ? config.getLocalExternalIds(item)
          : [config.getLocalExternalId(item)].filter((id): id is SearchExternalId => id !== null),
      ),
    );
    const externalIdsOf = (item: TExternalItem) =>
      config.getExternalIds ? config.getExternalIds(item) : [config.getExternalId(item)];

    let externalFetched: TExternalItem[] = [];
    if (remaining > 0) {
      externalFetched = await fetchWithNormalization(
        q,
        category,
        limit,
        page,
        config.normalizeSearchTerm,
        config.fetchExternal,
      );
    }

    const filteredExternalFetched = config.shouldIncludeExternalItem
      ? externalFetched.filter(config.shouldIncludeExternalItem)
      : externalFetched;

    const externalResults = filteredExternalFetched
      .filter(item => !externalIdsOf(item).some(id => localExternalIds.has(id)))
      .slice(0, remaining)
      .map(item => config.mapExternalItem(item, category));

    // Another page is worth asking for while the local page was full or a
    // provider still returned results for this one.
    const pagination = config.paginated
      ? { page, hasMore: typedLocalItemsRaw.length === limit || externalFetched.length > 0 }
      : {};

    if (localResults.length > 0 || externalResults.length > 0) {
      return NextResponse.json({
        source: resolveSource(localResults.length, externalResults.length),
        items: [...localResults, ...externalResults],
        ...pagination,
      });
    }

    if (page > 1) {
      return NextResponse.json({
        source: 'external' as SearchSource,
        items: [],
        page,
        hasMore: false,
      });
    }

    const fallback = await fetchWithNormalization(
      q,
      category,
      limit,
      page,
      config.normalizeSearchTerm,
      config.fetchExternal,
    );

    const fallbackFiltered = config.shouldIncludeExternalItem
      ? fallback.filter(config.shouldIncludeExternalItem)
      : fallback;

    return NextResponse.json({
      source: 'external' as SearchSource,
      items: fallbackFiltered.map(item => config.mapExternalItem(item, category)),
    });
  } catch (error) {
    console.error(`${config.logPrefix} search error:`, error);
    return NextResponse.json({ source: 'external', items: [] }, { status: 500 });
  }
}
