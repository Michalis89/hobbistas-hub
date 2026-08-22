import { sanitizeHtmlContent } from '@/utils/security/sanitizeHtml';

describe('sanitizeHtmlContent', () => {
  describe('editor contract', () => {
    // Every formatting control exposed by RichTextEditor must survive a save.
    it('keeps underline, strikethrough and horizontal rules', () => {
      expect(sanitizeHtmlContent('<p><u>u</u> <s>s</s></p><hr />')).toBe(
        '<p><u>u</u> <s>s</s></p><hr />',
      );
    });

    it('keeps figures with their captions', () => {
      const html =
        '<figure data-figure="" data-align="wide"><img src="https://cdn.x/a.png" alt="a" /><figcaption>A caption</figcaption></figure>';
      const out = sanitizeHtmlContent(html);
      expect(out).toContain('<figure');
      expect(out).toContain('<figcaption>A caption</figcaption>');
      expect(out).toContain('data-align="wide"');
    });

    it('keeps text alignment on paragraphs and headings', () => {
      expect(sanitizeHtmlContent('<p style="text-align: center">mid</p>')).toBe(
        '<p style="text-align:center">mid</p>',
      );
      expect(sanitizeHtmlContent('<h2 style="text-align: right">right</h2>')).toBe(
        '<h2 style="text-align:right">right</h2>',
      );
    });

    it('keeps the core block and inline formatting', () => {
      const html =
        '<h2>Title</h2><p><strong>b</strong> <em>i</em> <code>c</code></p><ul><li>x</li></ul><blockquote><p>q</p></blockquote><pre><code>code</code></pre>';
      expect(sanitizeHtmlContent(html)).toBe(html);
    });
  });

  describe('style injection', () => {
    it('drops CSS properties other than text-align', () => {
      const out = sanitizeHtmlContent(
        '<p style="text-align:center;position:fixed;top:0;background:url(javascript:alert(1))">x</p>',
      );
      expect(out).toBe('<p style="text-align:center">x</p>');
      expect(out).not.toContain('position');
      expect(out).not.toContain('javascript');
    });

    it('drops the style attribute entirely when no value survives', () => {
      expect(sanitizeHtmlContent('<p style="text-align:expression(alert(1))">x</p>')).toBe(
        '<p>x</p>',
      );
    });

    it('does not allow style on arbitrary tags', () => {
      expect(sanitizeHtmlContent('<li style="text-align:center">x</li>')).toBe('<li>x</li>');
    });
  });

  describe('script and url safety', () => {
    it('removes scripts and event handlers', () => {
      expect(sanitizeHtmlContent('<p onclick="alert(1)">x</p><script>alert(1)</script>')).toBe(
        '<p>x</p>',
      );
    });

    // Unsafe anchors are rewritten to <span>, which is itself not allowed, so
    // the tag is discarded and only the link text survives.
    it('strips non-https anchors but keeps their text', () => {
      expect(sanitizeHtmlContent('<p><a href="http://x.com">x</a></p>')).toBe('<p>x</p>');
      expect(sanitizeHtmlContent('<p><a href="javascript:alert(1)">x</a></p>')).toBe('<p>x</p>');
    });

    it('marks external https anchors as safe to open', () => {
      expect(sanitizeHtmlContent('<p><a href="https://x.com">x</a></p>')).toBe(
        '<p><a href="https://x.com" rel="noopener noreferrer" target="_blank">x</a></p>',
      );
    });

    it('keeps https images and removes non-https ones', () => {
      expect(sanitizeHtmlContent('<img src="https://cdn.x/a.png" alt="a" />')).toBe(
        '<img src="https://cdn.x/a.png" alt="a" />',
      );
      expect(sanitizeHtmlContent('<img src="http://cdn.x/a.png" />')).toBe('');
    });
  });

  it('returns an empty string for nullish input', () => {
    expect(sanitizeHtmlContent(null)).toBe('');
    expect(sanitizeHtmlContent(undefined)).toBe('');
    expect(sanitizeHtmlContent('')).toBe('');
  });
});
