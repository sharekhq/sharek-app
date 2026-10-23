// isomorphic-dompurify's CommonJS build does `require("jsdom")` at load with no
// `window` check, and jsdom's dependency tree is ESM where Jest cannot parse it.
// Stubbing the package keeps the real sanitizePostContent — the allow-list it
// passes is observed through the call, which is what these assertions are for.
// jest.mock is hoisted above the imports below.
// (branch 126-rtl-auto-direction.)
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: jest.fn((value: string) => value),
    addHook: jest.fn(),
  },
}));

import DOMPurify from 'isomorphic-dompurify';
import { sanitizePostContent } from './sanitize.post.content';

const sanitize = DOMPurify.sanitize as jest.Mock;
// Registered once, when the module loads, so it is read before any test runs.
const uponSanitizeElement = (DOMPurify.addHook as jest.Mock).mock
  .calls[0][1] as (node: Element, data: { tagName: string }) => void;

const configFor = (value: string) => {
  sanitize.mockClear();
  sanitizePostContent(value);
  expect(sanitize).toHaveBeenCalledTimes(1);
  return sanitize.mock.calls[0][1] as {
    ALLOWED_TAGS: string[];
    ALLOWED_ATTR: string[];
    ALLOWED_URI_REGEXP: RegExp;
  };
};

describe('sanitizePostContent allow-list', () => {
  it("allows 'dir', without which automatic text direction is stripped on render", () => {
    // The composer emits `<p dir="auto">` and the Instagram preview wraps its
    // caption in `<span dir="auto">`. DOMPurify drops any attribute not named
    // here, so losing the entry reverts the feature on every rendered post
    // while the editor itself still looks correct.
    expect(configFor('<p dir="auto">مرحبا</p>').ALLOWED_ATTR).toContain('dir');
  });

  it('still allows the attributes the previews and mentions depend on', () => {
    expect(configFor('<p>x</p>').ALLOWED_ATTR).toEqual(
      expect.arrayContaining([
        'href',
        'target',
        'rel',
        'class',
        'data-mention-id',
        'data-mention-label',
      ])
    );
  });

  it('allows the tags a post is built from, and no more', () => {
    expect(configFor('<p>x</p>').ALLOWED_TAGS).toEqual([
      'p',
      'br',
      'strong',
      'u',
      'a',
      'ul',
      'li',
      'h1',
      'h2',
      'h3',
      'span',
      'img',
    ]);
  });

  it("allows 'src' and 'alt', which a picture in the post text needs", () => {
    expect(configFor('<p>x</p>').ALLOWED_ATTR).toEqual(
      expect.arrayContaining(['src', 'alt'])
    );
  });

  it('has not acquired an attribute that can execute or reposition', () => {
    const allowed = configFor('<p>x</p>').ALLOWED_ATTR;
    expect(allowed.filter((a) => ['style', 'srcdoc'].includes(a))).toEqual([]);
    expect(allowed.some((a) => a.toLowerCase().startsWith('on'))).toBe(false);
  });

  it('still restricts hrefs to http, mailto and same-origin', () => {
    const { ALLOWED_URI_REGEXP } = configFor('<a href="x">x</a>');
    expect('https://sharek.app').toMatch(ALLOWED_URI_REGEXP);
    expect('mailto:mo@sharek.app').toMatch(ALLOWED_URI_REGEXP);
    expect('javascript:alert(1)').not.toMatch(ALLOWED_URI_REGEXP);
    expect('data:text/html;base64,x').not.toMatch(ALLOWED_URI_REGEXP);
  });
});

describe('sanitizePostContent picture hook', () => {
  // DOMPurify keeps a data: URI on <img> whatever ALLOWED_URI_REGEXP says, so
  // the hook drops any picture that does not point to a real file.
  const picture = (src: string) => {
    const parent = { removeChild: jest.fn() };
    const node = {
      getAttribute: () => src,
      parentNode: parent,
    } as unknown as Element;
    uponSanitizeElement(node, { tagName: 'img' });
    return { node, removed: parent.removeChild };
  };

  it('removes a picture whose src is a data: URI', () => {
    const { node, removed } = picture('data:image/png;base64,iVBORw0KGgo=');
    expect(removed).toHaveBeenCalledWith(node);
  });

  it('keeps a picture whose src is an https URL', () => {
    const { removed } = picture('https://cdn.sharek.app/a.png');
    expect(removed).not.toHaveBeenCalled();
  });
});

// Upstream 14e5a467 + 2ded21d1: block tags the editor does not know become
// paragraphs before DOMPurify runs, which would otherwise drop the tag and glue
// its line to the next one. Read off what the stubbed sanitizer receives.
describe('sanitizePostContent block tags', () => {
  const received = (value: string) => {
    sanitize.mockClear();
    sanitizePostContent(value);
    return sanitize.mock.calls[0][0] as string;
  };

  it('turns the block tags the editor lacks into paragraphs, attributes dropped', () => {
    expect(
      received(
        '<div>Line one</div><div class="x">Line two</div><blockquote>q</blockquote><pre>p</pre><h4>T</h4>'
      )
    ).toBe('<p>Line one</p><p>Line two</p><p>q</p><p>p</p><p>T</p>');
  });

  it("leaves the editor's own tags and look-alike names alone", () => {
    const value = '<p>a</p><h2>b</h2><span>c</span><divider>d</divider>';

    expect(received(value)).toBe(value);
  });

  // The attribute run stops at a '<', so a block tag that never closes cannot
  // swallow the tag after it (or scan to the end of a long text).
  it('does not let an unclosed block tag take the next tag with it', () => {
    const value = '<div <strong>bold</strong>';

    expect(received(value)).toBe(value);
  });
});

describe('sanitizePostContent input handling', () => {
  it.each([null, undefined, 42, {}, []])(
    'returns an empty string for %p without calling the sanitizer',
    (value) => {
      sanitize.mockClear();
      expect(sanitizePostContent(value)).toBe('');
      expect(sanitize).not.toHaveBeenCalled();
    }
  );

  it('returns an empty string for an empty string', () => {
    sanitize.mockClear();
    expect(sanitizePostContent('')).toBe('');
    expect(sanitize).not.toHaveBeenCalled();
  });
});
