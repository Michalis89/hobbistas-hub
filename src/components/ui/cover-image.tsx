'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

export const THUMB_SIZES_XXS = '32px';
export const THUMB_SIZES_XS = '40px';
export const THUMB_SIZES_SM = '48px';
export const THUMB_SIZES_TINY = '56px';
export const THUMB_SIZES_MD = '64px';
export const DEFAULT_THUMB_SIZES = '(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 240px';
export const DEFAULT_HERO_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px';
export const IMAGE_SIZES = {
  grid3: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  grid4: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  list: DEFAULT_THUMB_SIZES,
  hero: DEFAULT_HERO_SIZES,
  thumb: THUMB_SIZES_MD,
} as const;

/**
 * Values that reach these components meaning "there is no cover".
 *
 * `''` is what the library mappers produce for an item the provider has no
 * art for. `/og-image.jpg` is the site's Open Graph banner, wired up years
 * ago as `DEFAULT_COVER`: it is a 1200x630 landscape card, so in a 2:3
 * portrait slot it renders as a squashed crop of the site logo. Treating it
 * as absent here fixes every call site at once, without rewriting the ten
 * mappers that still hand it out.
 */
const MISSING_COVER_SRC = new Set(['', '/og-image.jpg']);

function hasCoverSrc(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') {
    return Boolean(src);
  }
  return !MISSING_COVER_SRC.has(src.trim());
}

/** The shipped placeholder artwork. */
export const NO_COVER_IMAGE = '/no-image.png';

/**
 * Stands in for cover art that is missing or failed to load.
 *
 * The artwork is a transparent square, while most slots it fills are 2:3
 * portrait. `object-contain` therefore beats `object-cover`: nothing is
 * cropped, and the space around it is not letterboxing but the themed
 * background of the wrapper showing through - which is also what keeps this
 * readable in the light theme as well as the dark default.
 *
 * Left to the image optimizer rather than served raw: next.config.ts asks
 * for AVIF and WebP and lists 16-256px buckets, which turns this PNG
 * into a couple of KB at the sizes actually used. It is one source image, so
 * the Vercel transformation count is a handful of variants, cached for a day.
 */
export function CoverFallback({
  label,
  className,
}: {
  /** Title of the item, used for the accessible name. */
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ? `${label} - no cover art` : 'No cover art'}
      className={cn('relative h-full w-full overflow-hidden bg-muted', className)}
    >
      <Image
        // Decorative: the wrapper above already carries the accessible name,
        // so announcing it twice would only add noise.
        alt=""
        aria-hidden
        src={NO_COVER_IMAGE}
        fill
        sizes="(max-width: 640px) 50vw, 240px"
        className="object-contain p-[12%]"
      />
    </div>
  );
}

export const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PC9zdmc+';


type CoverImageProps = Omit<ImageProps, 'fill' | 'sizes' | 'className'> & {
  sizes?: ImageProps['sizes'];
  className?: ImageProps['className'];
  priority?: boolean;
  blur?: boolean;
  /** Extra classes for the placeholder, so it can match the slot's radius. */
  fallbackClassName?: string;
};

function CoverImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
  blur = true,
  placeholder,
  blurDataURL,
  fallbackClassName,
  onError,
  ...rest
}: CoverImageProps & { sizes: ImageProps['sizes'] }) {
  // Which src failed, rather than a boolean: a list that recycles its DOM
  // nodes would otherwise keep showing the placeholder for the next item
  // once any one image had failed. Comparing against the current src resets
  // it during render, with no effect to synchronise.
  const [failedSrc, setFailedSrc] = useState<ImageProps['src'] | null>(null);

  if (failedSrc === src || !hasCoverSrc(src)) {
    return (
      <CoverFallback label={typeof alt === 'string' ? alt : undefined} className={fallbackClassName} />
    );
  }

  const resolvedPlaceholder = placeholder ?? (blur ? 'blur' : undefined);
  const resolvedBlurDataURL = blurDataURL ?? (blur ? BLUR_DATA_URL : undefined);

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      placeholder={resolvedPlaceholder}
      blurDataURL={resolvedBlurDataURL}
      className={cn('object-cover', className)}
      // A dead URL - a delisted CDN entry, a provider that dropped the art -
      // is indistinguishable from no art at all as far as the reader cares.
      onError={event => {
        setFailedSrc(src);
        onError?.(event);
      }}
      {...rest}
    />
  );
}

export function CoverThumbImage({ sizes = DEFAULT_THUMB_SIZES, ...props }: CoverImageProps) {
  return <CoverImage sizes={sizes} {...props} />;
}

export function CoverHeroImage({ sizes = DEFAULT_HERO_SIZES, ...props }: CoverImageProps) {
  return <CoverImage sizes={sizes} {...props} />;
}
