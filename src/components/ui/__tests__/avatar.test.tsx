import { createRef, forwardRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

jest.mock('@radix-ui/react-avatar', () => {
  const Root = forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<'span'>>(
    ({ children, ...props }, ref) => (
      <span ref={ref} {...props}>
        {children}
      </span>
    ),
  );
  Root.displayName = 'Avatar';

  const Image = forwardRef<HTMLImageElement, React.ComponentPropsWithoutRef<'img'>>(
    ({ alt = '', ...props }, ref) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={ref} alt={alt} {...props} />
    ),
  );
  Image.displayName = 'AvatarImage';

  const Fallback = forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<'span'>>(
    ({ children, ...props }, ref) => (
      <span ref={ref} {...props}>
        {children}
      </span>
    ),
  );
  Fallback.displayName = 'AvatarFallback';

  return { Root, Image, Fallback };
});

describe('Avatar', () => {
  it('renders the root with default and custom classes and forwards props', () => {
    const ref = createRef<HTMLSpanElement>();

    render(
      <Avatar ref={ref} className="ring-2" data-testid="avatar-root" aria-label="Profile">
        <AvatarFallback>MK</AvatarFallback>
      </Avatar>,
    );

    const root = screen.getByTestId('avatar-root');
    expect(root).toHaveAttribute('aria-label', 'Profile');
    expect(root).toHaveClass(
      'relative',
      'flex',
      'h-10',
      'w-10',
      'shrink-0',
      'overflow-hidden',
      'rounded-full',
      'ring-2',
    );
    expect(ref.current).toBe(root);
  });

  it('renders the image with default and custom classes and forwards refs', () => {
    const ref = createRef<HTMLImageElement>();

    render(
      <Avatar>
        <AvatarImage ref={ref} className="opacity-90" src="/avatar.png" alt="User avatar" />
      </Avatar>,
    );

    const image = screen.getByRole('img', { name: 'User avatar' });
    expect(image).toHaveAttribute('src', '/avatar.png');
    expect(image).toHaveClass('aspect-square', 'h-full', 'w-full', 'opacity-90');
    expect(ref.current).toBe(image);
  });

  it('renders the fallback with default and custom classes and forwards refs', () => {
    const ref = createRef<HTMLSpanElement>();

    render(
      <Avatar>
        <AvatarFallback ref={ref} className="text-sm" data-testid="avatar-fallback">
          MK
        </AvatarFallback>
      </Avatar>,
    );

    const fallback = screen.getByTestId('avatar-fallback');
    expect(fallback).toHaveTextContent('MK');
    expect(fallback).toHaveClass(
      'flex',
      'h-full',
      'w-full',
      'items-center',
      'justify-center',
      'rounded-full',
      'bg-muted',
      'text-sm',
    );
    expect(ref.current).toBe(fallback);
  });
});
