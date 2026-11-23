import { render, screen } from '@testing-library/react';
import SeoPreview from '../SeoPreview';
import { resolveArticleSeo } from '@/lib/articles/locales';

const english = (fields: Partial<Parameters<typeof resolveArticleSeo>[0]>) =>
  resolveArticleSeo(
    { title: 'Lore', description: null, meta_title: null, meta_description: null, ...fields },
    null,
    'en',
  );

describe('SeoPreview', () => {
  it('English: shows the bare URL and the values the page publishes', () => {
    render(
      <SeoPreview
        seo={english({ meta_title: 'Meta', meta_description: 'Meta desc' })}
        slug="lore"
        basePath="/articles"
      />,
    );
    expect(screen.getByText(/\/articles\/lore$/)).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Meta desc')).toBeInTheDocument();
    expect(
      screen.getByText('Title from: meta title. Description from: meta description.'),
    ).toBeInTheDocument();
  });

  it('English: previews the neutral fallback when there is no description at all', () => {
    render(<SeoPreview seo={english({})} slug="lore" basePath="/articles" />);
    expect(screen.getByText('Read “Lore” on Hobbistas.')).toBeInTheDocument();
    expect(screen.getByText(/Description from: automatic fallback\./)).toBeInTheDocument();
    expect(screen.queryByText(/resolve this/)).not.toBeInTheDocument();
  });

  it('Greek: shows the ?lang=el URL', () => {
    render(
      <SeoPreview
        seo={resolveArticleSeo(
          { title: 'Lore', description: null, meta_title: null, meta_description: null },
          { title: 'Θρύλοι', description: 'Περίληψη', meta_title: null, meta_description: null },
          'el',
        )}
        slug="lore"
        basePath="/review"
        locale="el"
      />,
    );
    expect(screen.getByText(/\/review\/lore\?lang=el$/)).toBeInTheDocument();
    expect(screen.getByText('Θρύλοι')).toBeInTheDocument();
  });
});
