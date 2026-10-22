import { render, screen } from '@testing-library/react';
import CopyrightPage, { metadata } from '@/app/(legal)/copyright/page';
import { SITE_CONTACT_EMAIL } from '@/config/site';

jest.mock('@/utils/seo/StructuredData', () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="structured-data">{JSON.stringify(data)}</div>
  ),
}));

jest.mock('@/app/components/layout', () => ({
  __esModule: true,
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title, description }: { title: string; description: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <div>{description}</div>
    </header>
  ),
}));

describe('CopyrightPage', () => {
  it('is indexable at /copyright', () => {
    expect(metadata.title).toBe('Copyright & Takedown Policy');
    expect(String(metadata.alternates?.canonical)).toBe('https://hobbistas-hub.com/copyright');
  });

  it('tells rights holders where to send a notice', () => {
    render(<CopyrightPage />);

    expect(
      screen.getByRole('heading', { name: 'Copyright & Takedown Policy', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: SITE_CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${SITE_CONTACT_EMAIL}`,
    );
  });

  it('covers both the DMCA and the EU notice-and-action procedure', () => {
    render(<CopyrightPage />);

    expect(screen.getByText(/17 U\.S\.C\. § 512\(c\)\(3\)/)).toBeInTheDocument();
    expect(screen.getByText(/Digital Services Act/)).toBeInTheDocument();
  });

  it('names the catalogues cover images come from', () => {
    render(<CopyrightPage />);

    expect(
      screen.getByText(/Google Books, Open Library, the National Library of Greece, Hardcover/),
    ).toBeInTheDocument();
  });
});
