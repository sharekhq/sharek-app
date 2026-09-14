// Guards the HTML→plain/markdown conversion that runs on the way to every
// provider. The composer now emits `<p dir="auto">` and `<h1 dir="auto">` for
// automatic text direction, and the conversion's tag regexes were written
// without anticipating an attribute: a regex matching only a bare `<p>` drops
// the markdown conversion for every post the moment the editor adds one.
//
// Every case below encodes the same invariant — a dir attribute is
// presentational, so it must not change a byte the platform receives.
// (branch 126-rtl-auto-direction.)
import { stripHtmlValidation } from './strip.html.validation';

describe('stripHtmlValidation — a dir attribute is presentational', () => {
  // The three types whose output leaves for a platform as text. A `dir` is a
  // rendering hint the platform never sees, so it must not alter a byte.
  //
  // `as const` is load-bearing, unlike on the plain it.each tables elsewhere in
  // the repo: the first column is the function's union-typed `type` parameter,
  // and a widened `string` does not satisfy it.
  it.each([
    ['markdown', '<h1>Title</h1>', '<h1 dir="auto">Title</h1>'],
    ['markdown', '<h2>Title</h2>', '<h2 dir="auto">Title</h2>'],
    ['markdown', '<h3>Title</h3>', '<h3 dir="auto">Title</h3>'],
    ['markdown', '<p>Hello</p>', '<p dir="auto">Hello</p>'],
    [
      'markdown',
      '<p>One</p><p>Two</p>',
      '<p dir="auto">One</p><p dir="auto">Two</p>',
    ],
    [
      'normal',
      '<p>One</p><p>Two</p>',
      '<p dir="auto">One</p><p dir="auto">Two</p>',
    ],
    ['none', '<p>Hello</p>', '<p dir="auto">Hello</p>'],
  ] as const)(
    'type=%s treats %s and %s identically',
    (type, plainTag, withDir) => {
      expect(stripHtmlValidation(type, withDir)).toBe(
        stripHtmlValidation(type, plainTag)
      );
    }
  );

  it('type=html keeps the dir, because that output is rendered', () => {
    // The odd one out, and deliberately so: `html` exists to return markup with
    // its allowed tags intact for a surface that renders it. Stripping the
    // direction there would be the bug, not preserving it.
    expect(stripHtmlValidation('html', '<p dir="auto">Hello</p>')).toContain(
      'dir="auto"'
    );
  });

  it('still converts a heading to markdown when it carries a dir', () => {
    // The specific failure this file exists for: the old regex was /<h1>/, so
    // a heading with any attribute fell through unconverted and the platform
    // received a bare line instead of "# ".
    expect(
      stripHtmlValidation('markdown', '<h1 dir="auto">Title</h1>')
    ).toContain('# Title');
  });

  it('still separates paragraphs when they carry a dir', () => {
    // `normal` short-circuits on `value.indexOf('<p>') === -1`, which a
    // `<p dir="auto">` defeats — the function would return the raw HTML.
    const out = stripHtmlValidation(
      'normal',
      '<p dir="auto">One</p><p dir="auto">Two</p>'
    );
    expect(out).toContain('One');
    expect(out).toContain('Two');
    expect(out).not.toContain('<p');
  });

  it('converts Arabic content the same way with and without a dir', () => {
    // The whole point: this is the content that will carry the attribute.
    const arabic = 'أطلقنا اليوم ميزة جديدة';
    expect(stripHtmlValidation('markdown', `<p dir="auto">${arabic}</p>`)).toBe(
      stripHtmlValidation('markdown', `<p>${arabic}</p>`)
    );
  });
});

describe('stripHtmlValidation — behaviour the dir change must not disturb', () => {
  it('converts bold and underline to markdown', () => {
    expect(stripHtmlValidation('markdown', '<strong>x</strong>')).toContain(
      '**x**'
    );
    expect(stripHtmlValidation('markdown', '<u>x</u>')).toContain('__x__');
  });

  it('converts a link to markdown', () => {
    expect(
      stripHtmlValidation('markdown', '<a href="https://sharek.app">Sharek</a>')
    ).toContain('[Sharek](https://sharek.app)');
  });

  it('converts list items to dashes', () => {
    expect(stripHtmlValidation('markdown', '<ul><li>one</li></ul>')).toContain(
      '- one'
    );
  });

  it('strips every tag for type=none', () => {
    expect(
      stripHtmlValidation('none', '<p>Hello <strong>there</strong></p>')
    ).toBe('Hello there');
  });

  it('returns the value untouched when plain is set', () => {
    expect(
      stripHtmlValidation('markdown', '<p>raw</p>', false, false, true)
    ).toBe('<p>raw</p>');
  });
});
