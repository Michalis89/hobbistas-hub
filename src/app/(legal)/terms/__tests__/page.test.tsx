import { render, screen } from '@testing-library/react';
import TermsPage, { metadata } from '@/app/(legal)/terms/page';
import { SITE_CONTACT_EMAIL, SITE_URL } from '@/config/site';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';

jest.mock('@/utils/seo/StructuredData', () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="structured-data">{JSON.stringify(data)}</div>
  ),
}));

jest.mock('@/utils/seo/metadata/structuredData', () => ({
  __esModule: true,
  getBreadcrumbStructuredData: jest.fn(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [],
  })),
}));

jest.mock('@/app/components/layout', () => ({
  __esModule: true,
  PageContainer: ({
    children,
    size,
    className,
  }: {
    children: React.ReactNode;
    size?: string;
    className?: string;
  }) => (
    <div data-testid="page-container" data-size={size} data-class={className}>
      {children}
    </div>
  ),
  PageHeader: ({
    eyebrow,
    title,
    description,
    meta,
  }: {
    eyebrow: string;
    title: string;
    description: React.ReactNode;
    meta: string;
  }) => (
    <header>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{description}</div>
      <p>{meta}</p>
    </header>
  ),
}));

describe('TermsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports expected page metadata', () => {
    expect(metadata).toMatchObject({
      title: 'Terms of Service',
      description: 'Read the Terms of Service for using Hobbistas.',
    });
  });

  it('renders terms content and structured data', () => {
    render(<TermsPage />);

    expect(screen.getByTestId('page-container')).toHaveAttribute('data-size', 'lg');
    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText(`Last updated: ${new Date().getFullYear()}`)).toBeInTheDocument();
    expect(screen.getByText('1. Service Identity')).toBeInTheDocument();
    expect(screen.getByText('12. Contact')).toBeInTheDocument();
    expect(screen.getAllByText(SITE_CONTACT_EMAIL).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: SITE_URL.replace('https://', '') })).toHaveAttribute(
      'href',
      SITE_URL,
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Copyright & Takedown Policy' })).toHaveAttribute(
      'href',
      '/copyright',
    );

    expect(getBreadcrumbStructuredData).toHaveBeenCalledWith([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Terms of Service', url: `${SITE_URL}/terms` },
    ]);
    expect(screen.getByTestId('structured-data')).toBeInTheDocument();
  });
});
