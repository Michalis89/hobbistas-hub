import { render, screen } from '@testing-library/react';
import { AvatarImage } from '@/components/ui/avatar-image';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    className,
    height,
    priority,
    sizes,
    src,
    width,
  }: {
    alt: string;
    className?: string;
    height: number;
    priority?: boolean;
    sizes: string;
    src: string;
    width: number;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      data-height={height}
      data-priority={priority ? 'true' : 'false'}
      data-sizes={sizes}
      data-width={width}
      src={src}
    />
  ),
}));

describe('AvatarImage', () => {
  it('renders nothing when src is missing', () => {
    const { container } = render(<AvatarImage size={48} alt="Mina" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a square image with default alt and classes', () => {
    const { container } = render(<AvatarImage size={64} src="/avatar.png" />);

    const image = container.querySelector('img');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', '/avatar.png');
    expect(image).toHaveAttribute('data-width', '64');
    expect(image).toHaveAttribute('data-height', '64');
    expect(image).toHaveAttribute('data-sizes', '64px');
    expect(image).toHaveClass('h-full', 'w-full', 'object-cover');
  });

  it('merges custom className and forwards image props', () => {
    render(
      <AvatarImage
        size={32}
        src="/avatar.jpg"
        alt="Profile avatar"
        className="rounded-full"
        priority
      />,
    );

    const image = screen.getByRole('img', { name: 'Profile avatar' });
    expect(image).toHaveClass('h-full', 'w-full', 'object-cover', 'rounded-full');
    expect(image).toHaveAttribute('data-priority', 'true');
  });
});
