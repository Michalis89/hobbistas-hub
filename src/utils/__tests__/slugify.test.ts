import { slugify, normalizeSlug } from '@/utils/slugify';

describe('slugify', () => {
  it('slugifies plain latin titles', () => {
    expect(slugify('Final Fantasy X: A Journey Through Spira')).toBe(
      'final-fantasy-x-a-journey-through-spira',
    );
  });

  it('transliterates Greek instead of dropping it', () => {
    expect(slugify('Ο νέος Kratos')).toBe('o-neos-kratos');
  });

  it('keeps fully Greek titles resolvable', () => {
    // The previous implementation returned '' here, which made the API reject
    // the article with "Title, slug, and category are required".
    expect(slugify('Αυτός είναι ο νέος Κράτος')).toBe('aytos-einai-o-neos-kratos');
  });

  it('strips accents and diacritics', () => {
    expect(slugify('Καλημέρα')).toBe('kalimera');
    expect(slugify('Ταΐζω')).toBe('taizo');
  });

  it('handles final sigma', () => {
    expect(slugify('Κράτος')).toBe('kratos');
  });

  it('collapses separators and trims dashes', () => {
    expect(slugify('  Hello --- World!!  ')).toBe('hello-world');
  });

  it('returns an empty string for input with no slugifiable characters', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('normalizeSlug', () => {
  it('trims stray dashes left by legacy slug generation', () => {
    expect(normalizeSlug('-kratos-')).toBe('kratos');
  });

  it('falls back to the original value when only dashes remain', () => {
    expect(normalizeSlug('---')).toBe('---');
  });
});
