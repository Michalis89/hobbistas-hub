import { metadata } from '@/utils/seo/metadata/metadata';
import { buildMetadata } from '@/utils/seo/metadata/helpers';

describe('root metadata', () => {
  it('declares no canonical of its own', () => {
    // Metadata is inherited, so a canonical here becomes the claim of every
    // page that forgets to set one - pointing them all at the homepage.
    expect(metadata.alternates?.canonical).toBeUndefined();
  });

  it('still sets metadataBase so relative paths resolve', () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });
});

describe('buildMetadata canonical', () => {
  it('always emits a canonical, so no page relies on an inherited one', () => {
    const result = buildMetadata({ title: 'Anything', path: '/anything' });
    expect(result.alternates?.canonical?.toString()).toMatch(/\/anything$/);
  });

  it('strips a trailing slash but keeps the language query', () => {
    expect(buildMetadata({ title: 'T', path: '/articles/post/' }).alternates?.canonical?.toString())
      .toMatch(/\/articles\/post$/);
    expect(
      buildMetadata({ title: 'T', path: '/articles/post?lang=el' }).alternates?.canonical?.toString(),
    ).toMatch(/\/articles\/post\?lang=el$/);
  });

  it('converts the site locale to the underscore form Open Graph expects', () => {
    expect(buildMetadata({ title: 'T', path: '/' }).openGraph?.locale).toBe('en_US');
  });

  it('emits hreflang alternates only when given them', () => {
    expect(buildMetadata({ title: 'T', path: '/' }).alternates?.languages).toBeUndefined();
    expect(
      buildMetadata({
        title: 'T',
        path: '/',
        languages: { en: '/', el: '/?lang=el' },
      }).alternates?.languages,
    ).toEqual({ en: '/', el: '/?lang=el' });
  });
});
