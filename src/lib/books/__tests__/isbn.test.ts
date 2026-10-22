import { isGreekIsbn, parseIsbnQuery, toIsbn13 } from '../isbn';

describe('toIsbn13', () => {
  it('keeps a valid ISBN-13 and strips hyphens', () => {
    expect(toIsbn13('978-960-211-652-4')).toBe('9789602116524');
  });

  it('converts a valid ISBN-10, including an X check digit', () => {
    expect(toIsbn13('0-7475-3269-9')).toBe('9780747532699');
    expect(toIsbn13('080442957X')).toBe('9780804429573');
  });

  it('rejects bad check digits and junk', () => {
    expect(toIsbn13('9789602116525')).toBeNull();
    expect(toIsbn13('0747532698')).toBeNull();
    expect(toIsbn13('hello')).toBeNull();
    expect(toIsbn13(null)).toBeNull();
  });
});

describe('isGreekIsbn', () => {
  it('recognises the 960 and 618 group prefixes only', () => {
    expect(isGreekIsbn('9789602116524')).toBe(true);
    expect(isGreekIsbn('9786180000000')).toBe(true);
    expect(isGreekIsbn('9780747532699')).toBe(false);
    expect(isGreekIsbn(null)).toBe(false);
  });
});

describe('parseIsbnQuery', () => {
  it('treats an ISBN-shaped query as an ISBN', () => {
    expect(parseIsbnQuery(' 978-960-211-652-4 ')).toBe('9789602116524');
  });

  it('leaves title queries alone', () => {
    expect(parseIsbnQuery('Ζορμπάς')).toBeNull();
    expect(parseIsbnQuery('1984')).toBeNull();
  });
});
