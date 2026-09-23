import {
  applyArticleTranslation,
  availableLocales,
  findTranslation,
  localeFromAcceptLanguage,
  resolveArticleLocale,
  toArticleLocale,
  type ArticleTranslationFields,
} from '@/lib/articles/locales';

const source: ArticleTranslationFields = {
  title: 'The English Title',
  description: 'English standfirst',
  content_rich: { type: 'doc', content: [] },
  content_html: '<p>English body</p>',
  meta_title: 'English meta title',
  meta_description: 'English meta description',
};

describe('localeFromAcceptLanguage', () => {
  it('reads the first recognised tag', () => {
    expect(localeFromAcceptLanguage('el-GR,el;q=0.9,en;q=0.8')).toBe('el');
    expect(localeFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
  });

  it('skips languages the site does not have', () => {
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.9,el;q=0.8')).toBe('el');
  });

  it('returns null when nothing matches', () => {
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.9')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage('')).toBeNull();
  });
});

describe('resolveArticleLocale', () => {
  const available = ['en', 'el'] as const;

  it('lets an explicit request win over the saved preference', () => {
    // Otherwise clicking the switcher would appear to do nothing.
    expect(
      resolveArticleLocale({ requested: 'en', userPreference: 'el', available }),
    ).toBe('en');
  });

  it('falls back to the saved preference', () => {
    expect(resolveArticleLocale({ userPreference: 'el', available })).toBe('el');
  });

  it('falls back to the browser when there is no preference', () => {
    expect(resolveArticleLocale({ acceptLanguage: 'el-GR,el;q=0.9', available })).toBe('el');
  });

  it('prefers the saved preference over the browser', () => {
    expect(
      resolveArticleLocale({ userPreference: 'en', acceptLanguage: 'el-GR', available }),
    ).toBe('en');
  });

  it('ignores a preference the article has not been translated into', () => {
    // A Greek reader on an untranslated piece gets English, not an empty page.
    expect(resolveArticleLocale({ userPreference: 'el', available: ['en'] })).toBe('en');
  });

  it('ignores junk', () => {
    expect(resolveArticleLocale({ requested: 'klingon', available })).toBe('en');
    expect(resolveArticleLocale({ requested: 42, userPreference: null, available })).toBe('en');
  });

  it('defaults to the source language when nothing is available', () => {
    expect(resolveArticleLocale({ requested: 'el', available: [] })).toBe('en');
    expect(resolveArticleLocale({ requested: 'el' })).toBe('en');
  });
});

describe('availableLocales', () => {
  it('always includes the source language', () => {
    expect(availableLocales([])).toEqual(['en']);
    expect(availableLocales(null)).toEqual(['en']);
  });

  it('includes a translation that has a title', () => {
    expect(availableLocales([{ locale: 'el', title: 'Ο τίτλος' }])).toEqual(['en', 'el']);
  });

  it('ignores a started-but-empty translation', () => {
    // A blank draft in the studio must not light up the switcher.
    expect(availableLocales([{ locale: 'el', title: '   ' }])).toEqual(['en']);
  });

  it('ignores locales the site does not support', () => {
    expect(availableLocales([{ locale: 'fr', title: 'Le titre' }])).toEqual(['en']);
  });
});

describe('applyArticleTranslation', () => {
  it('returns the article untouched when there is no translation', () => {
    expect(applyArticleTranslation(source, null)).toBe(source);
  });

  it('overlays every translated field', () => {
    const result = applyArticleTranslation(source, {
      title: 'Ο τίτλος',
      description: 'Η περίληψη',
      content_rich: { type: 'doc', content: [{ type: 'paragraph' }] },
      content_html: '<p>Το κείμενο</p>',
      meta_title: 'Ελληνικό meta',
      meta_description: 'Ελληνική περιγραφή',
    });

    expect(result.title).toBe('Ο τίτλος');
    expect(result.content_html).toBe('<p>Το κείμενο</p>');
    expect(result.meta_title).toBe('Ελληνικό meta');
  });

  it('falls back per field when the translator left one blank', () => {
    const result = applyArticleTranslation(source, {
      title: 'Ο τίτλος',
      description: null,
      content_rich: { type: 'doc', content: [{ type: 'paragraph' }] },
      content_html: '<p>Το κείμενο</p>',
      meta_title: '',
      meta_description: null,
    });

    expect(result.title).toBe('Ο τίτλος');
    expect(result.description).toBe('English standfirst');
    expect(result.meta_title).toBe('English meta title');
    expect(result.meta_description).toBe('English meta description');
  });

  it('keeps the body in one language when the translation has no body', () => {
    // Mixing a Greek rich doc with an English HTML fallback would render one
    // language and cache the other.
    const result = applyArticleTranslation(source, {
      title: 'Ο τίτλος',
      description: 'Η περίληψη',
      content_rich: null,
      content_html: '   ',
      meta_title: null,
      meta_description: null,
    });

    expect(result.content_rich).toEqual(source.content_rich);
    expect(result.content_html).toBe('<p>English body</p>');
  });

  it('keeps the source body when the translation omits it entirely', () => {
    // An object without the key at all, not merely null.
    const result = applyArticleTranslation(source, {
      title: 'Ο τίτλος',
      description: null,
      content_html: null,
      meta_title: null,
      meta_description: null,
    } as unknown as ArticleTranslationFields);

    expect(result.content_rich).toEqual(source.content_rich);
    expect(result.content_html).toBe('<p>English body</p>');
  });

  it('keeps the source title when the translation title is blank', () => {
    const result = applyArticleTranslation(source, {
      title: '  ',
      description: null,
      content_rich: null,
      content_html: null,
      meta_title: null,
      meta_description: null,
    });

    expect(result.title).toBe('The English Title');
  });
});

describe('findTranslation', () => {
  const rows = [
    {
      article_id: 1,
      locale: 'el',
      title: 'Ο τίτλος',
      description: null,
      content_rich: null,
      content_html: null,
      meta_title: null,
      meta_description: null,
    },
  ];

  it('finds a translation row', () => {
    expect(findTranslation(rows, 'el')?.title).toBe('Ο τίτλος');
  });

  it('never returns a row for the source language', () => {
    // English lives on the article, so asking for it must not match a stray row.
    expect(findTranslation(rows, 'en')).toBeNull();
  });

  it('returns null when the locale is missing', () => {
    expect(findTranslation([], 'el')).toBeNull();
    expect(findTranslation(null, 'el')).toBeNull();
  });
});

describe('toArticleLocale', () => {
  it('narrows valid values and rejects everything else', () => {
    expect(toArticleLocale('el')).toBe('el');
    expect(toArticleLocale('de')).toBe('en');
    expect(toArticleLocale(undefined)).toBe('en');
  });
});
