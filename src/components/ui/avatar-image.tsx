import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

type AvatarImageProps = Omit<
  ImageProps,
  'fill' | 'width' | 'height' | 'sizes' | 'className' | 'src' | 'alt'
> & {
  src?: ImageProps['src'];
  alt?: string;
  size: number;
  className?: string;
};

/** Avatars we host ourselves; everything else is a URL a user pasted. */
const OWN_STORAGE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host;
  } catch {
    return '';
  }
})();

/**
 * The image optimizer rejects any host missing from `images.remotePatterns`
 * with a 400, which turned a pasted avatar URL into a broken image. Only our
 * own storage is guaranteed to be listed, so anything else renders
 * unoptimized - it bypasses the optimizer and loads the original URL.
 */
function isOptimizable(src: ImageProps['src']) {
  if (typeof src !== 'string') {
    return true;
  }
  if (src.startsWith('/')) {
    return true;
  }
  try {
    return new URL(src).host === OWN_STORAGE_HOST;
  } catch {
    return false;
  }
}

export function AvatarImage({ size, className, ...props }: AvatarImageProps) {
  const { src, alt, ...rest } = props;
  if (!src) {
    return null;
  }

  return (
    <Image
      src={src}
      alt={alt ?? ''}
      {...rest}
      width={size}
      height={size}
      sizes={`${size}px`}
      unoptimized={!isOptimizable(src)}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
