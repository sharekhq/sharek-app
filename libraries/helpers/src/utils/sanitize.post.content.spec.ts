// isomorphic-dompurify's CommonJS build does `require("jsdom")` at load with no
// `window` check, and jsdom's dependency tree is ESM where Jest cannot parse it.
// Stubbing the package keeps the real sanitizePostContent — the allow-list it
// passes is observed through the call, which is what these assertions are for.
// jest.mock is hoisted above the imports below.
// (branch 126-rtl-auto-direction.)
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: jest.fn((value: string) => value) },
}));

import DOMPurify from 'isomorphic-dompurify';
import { sanitizePostContent } from './sanitize.post.content';

const sanitize = DOMPurify.sanitize as jest.Mock;

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
    ]);
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
