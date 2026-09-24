import { fireEvent, render, screen } from '@testing-library/react';
import {
  BLUR_DATA_URL,
  CoverHeroImage,
  CoverThumbImage,
  DEFAULT_HERO_SIZES,
  DEFAULT_THUMB_SIZES,
  IMAGE_SIZES,
  THUMB_SIZES_MD,
  THUMB_SIZES_SM,
} from '@/components/ui/cover-image';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    blurDataURL,
    className,
    fill,
    onError,
    placeholder,
    priority,
    sizes,
    src,
    title,
  }: {
    alt: string;
    blurDataURL?: string;
    className?: string;
    fill?: boolean;
    placeholder?: string;
    priority?: boolean;
    sizes?: string;
    src: string;
    title?: string;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      data-blur-data-url={blurDataURL}
      data-fill={fill ? 'true' : 'false'}
      data-placeholder={placeholder}
      data-priority={priority ? 'true' : 'false'}
      data-sizes={sizes}
      onError={onError}
      src={src}
      title={title}
    />
  ),
}));

describe('cover image constants', () => {
  it('exposes reusable size presets and blur data', () => {
    expect(IMAGE_SIZES.list).toBe(DEFAULT_THUMB_SIZES);
    expect(IMAGE_SIZES.hero).toBe(DEFAULT_HERO_SIZES);
    expect(IMAGE_SIZES.thumb).toBe(THUMB_SIZES_MD);
    expect(THUMB_SIZES_SM).toBe('48px');
    expect(BLUR_DATA_URL).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe('CoverThumbImage', () => {
  it('renders a filling thumb image with default blur placeholder', () => {
    render(<CoverThumbImage src="/covers/book.jpg" alt="Book cover" />);

    const image = screen.getByRole('img', { name: 'Book cover' });
    expect(image).toHaveAttribute('src', '/covers/book.jpg');
    expect(image).toHaveAttribute('data-fill', 'true');
    expect(image).toHaveAttribute('data-priority', 'false');
    expect(image).toHaveAttribute('data-sizes', DEFAULT_THUMB_SIZES);
    expect(image).toHaveAttribute('data-placeholder', 'blur');
    expect(image).toHaveAttribute('data-blur-data-url', BLUR_DATA_URL);
    expect(image).toHaveClass('object-cover');
  });

  it('merges custom classes and forwards image props', () => {
    render(
      <CoverThumbImage
        src="/covers/game.jpg"
        alt="Game cover"
        className="rounded-md"
        priority
        sizes={THUMB_SIZES_SM}
        title="Forwarded title"
      />,
    );

    const image = screen.getByRole('img', { name: 'Game cover' });
    expect(image).toHaveClass('object-cover', 'rounded-md');
    expect(image).toHaveAttribute('data-priority', 'true');
    expect(image).toHaveAttribute('data-sizes', THUMB_SIZES_SM);
    expect(image).toHaveAttribute('title', 'Forwarded title');
  });

  it('can disable blur defaults or use explicit placeholder values', () => {
    const { rerender } = render(
      <CoverThumbImage src="/covers/plain.jpg" alt="Plain cover" blur={false} />,
    );

    let image = screen.getByRole('img', { name: 'Plain cover' });
    expect(image).not.toHaveAttribute('data-placeholder');
    expect(image).not.toHaveAttribute('data-blur-data-url');

    rerender(
      <CoverThumbImage
        src="/covers/plain.jpg"
        alt="Plain cover"
        blur={false}
        placeholder="empty"
        blurDataURL="custom-blur"
      />,
    );

    image = screen.getByRole('img', { name: 'Plain cover' });
    expect(image).toHaveAttribute('data-placeholder', 'empty');
    expect(image).toHaveAttribute('data-blur-data-url', 'custom-blur');
  });
});

describe('CoverHeroImage', () => {
  it('renders a filling hero image with hero sizes and blur defaults', () => {
    render(<CoverHeroImage src="/hero/movie.jpg" alt="Movie hero" />);

    const image = screen.getByRole('img', { name: 'Movie hero' });
    expect(image).toHaveAttribute('src', '/hero/movie.jpg');
    expect(image).toHaveAttribute('data-fill', 'true');
    expect(image).toHaveAttribute('data-priority', 'false');
    expect(image).toHaveAttribute('data-sizes', DEFAULT_HERO_SIZES);
    expect(image).toHaveAttribute('data-placeholder', 'blur');
    expect(image).toHaveAttribute('data-blur-data-url', BLUR_DATA_URL);
    expect(image).toHaveClass('object-cover');
  });

  it('supports custom classes, priority, sizes, and disabled blur', () => {
    render(
      <CoverHeroImage
        src="/hero/anime.jpg"
        alt="Anime hero"
        blur={false}
        className="opacity-90"
        priority
        sizes={IMAGE_SIZES.grid3}
      />,
    );

    const image = screen.getByRole('img', { name: 'Anime hero' });
    expect(image).toHaveClass('object-cover', 'opacity-90');
    expect(image).toHaveAttribute('data-priority', 'true');
    expect(image).toHaveAttribute('data-sizes', IMAGE_SIZES.grid3);
    expect(image).not.toHaveAttribute('data-placeholder');
    expect(image).not.toHaveAttribute('data-blur-data-url');
  });
});

describe('missing cover art', () => {
  it('draws the placeholder instead of an empty image when there is no src', () => {
    render(<CoverThumbImage src="" alt="Witch on the Holy Night" />);

    expect(screen.queryByRole('img', { name: 'Witch on the Holy Night' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Witch on the Holy Night - no cover art' }),
    ).toBeInTheDocument();
  });

  it('treats the legacy /og-image.jpg sentinel as no cover', () => {
    // The mappers still hand this out as DEFAULT_COVER. It is a 1200x630
    // landscape banner, so in a 2:3 slot it renders as a squashed logo.
    render(<CoverThumbImage src="/og-image.jpg" alt="Some Title" />);

    expect(screen.getByRole('img', { name: 'Some Title - no cover art' })).toBeInTheDocument();
  });

  it('falls back to the placeholder when the image fails to load', () => {
    render(<CoverHeroImage src="https://cdn.example.com/dead.jpg" alt="Dead Link" />);

    fireEvent.error(screen.getByRole('img', { name: 'Dead Link' }));

    expect(screen.getByRole('img', { name: 'Dead Link - no cover art' })).toBeInTheDocument();
  });

  it('recovers when the src changes after a failure', () => {
    const { rerender } = render(<CoverThumbImage src="https://cdn.example.com/dead.jpg" alt="A" />);
    fireEvent.error(screen.getByRole('img', { name: 'A' }));
    expect(screen.getByRole('img', { name: 'A - no cover art' })).toBeInTheDocument();

    // A recycled row must not inherit the previous item's failure.
    rerender(<CoverThumbImage src="https://cdn.example.com/good.jpg" alt="B" />);

    expect(screen.getByRole('img', { name: 'B' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'B - no cover art' })).not.toBeInTheDocument();
  });

  it('still names the placeholder when no title is available', () => {
    render(<CoverThumbImage src="" alt="" />);

    expect(screen.getByRole('img', { name: 'No cover art' })).toBeInTheDocument();
  });
});
