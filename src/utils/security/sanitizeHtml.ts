import sanitizeHtml from 'sanitize-html';

const isProtocolRelative = (value: string) => value.trim().startsWith('//');

const isSafeUrl = (rawUrl: string, allowRelative: boolean) => {
  if (!rawUrl) {
    return false;
  }
  const trimmed = rawUrl.trim();
  if (isProtocolRelative(trimmed)) {
    return false;
  }
  if (allowRelative && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const sanitizeHtmlContent = (html: string | null | undefined) => {
  if (!html) {
    return '';
  }

  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'strong',
      'em',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
      'pre',
      'a',
      'img',
      // Produced by the editor toolbar. Keep this list in sync with the
      // extensions registered in RichTextEditor.client.tsx - anything the
      // toolbar can insert but the sanitizer drops disappears silently on save.
      'u',
      's',
      'hr',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      // TextAlign serialises to an inline style; the value is constrained by
      // allowedStyles below so no arbitrary CSS can get through.
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      // Width variants for figures; the value is constrained below.
      figure: ['data-figure', 'data-align'],
    },
    allowedClasses: {},
    allowedStyles: {
      '*': {
        'text-align': [/^(?:left|right|center|justify)$/],
      },
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: {
      a: ['https'],
      img: ['https'],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href || '';
        const isSafe = isSafeUrl(href, true);
        if (!isSafe) {
          return { tagName: 'span', attribs: {} };
        }
        const isExternal = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href);
        const anchorAttribs: Record<string, string> = {
          href,
          rel: 'noopener noreferrer',
        };
        if (isExternal) {
          anchorAttribs.target = '_blank';
        }
        if (attribs.title) {
          anchorAttribs.title = attribs.title;
        }
        return {
          tagName: 'a',
          attribs: anchorAttribs,
        };
      },
      img: (_tagName, attribs) => {
        const src = attribs.src || '';
        const isSafe = isSafeUrl(src, false);
        if (!isSafe) {
          return { tagName: 'img', attribs: { src: '' } };
        }
        const imgAttribs: Record<string, string> = { src };
        if (attribs.alt) {
          imgAttribs.alt = attribs.alt;
        }
        if (attribs.title) {
          imgAttribs.title = attribs.title;
        }
        if (attribs.width) {
          imgAttribs.width = attribs.width;
        }
        if (attribs.height) {
          imgAttribs.height = attribs.height;
        }
        return {
          tagName: 'img',
          attribs: imgAttribs,
        };
      },
    },
    exclusiveFilter: frame => {
      if (frame.tag === 'img') {
        const src = frame.attribs?.src || '';
        return !isSafeUrl(src, false);
      }
      return false;
    },
  });
};
