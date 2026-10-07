import { countLength, weightedLength } from './count.length';

// Threads allows 500 characters and counts an emoji as its UTF-8 bytes. Every
// other character is one, so an Arabic post is not held to half the limit.
describe('countLength for threads', () => {
  it.each([
    ['an Arabic letter as one', 'ب'.repeat(300), 300],
    ['an emoji as its four bytes', '\u{1F600}', 4],
    ['a skin-toned emoji as one sequence', '\u{1F44D}\u{1F3FD}', 8],
    [
      'a ZWJ family as one sequence',
      '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}',
      25,
    ],
    ['a flag as its regional-indicator pair', '\u{1F1F8}\u{1F1E6}', 8],
    ['a keycap as one sequence', '1\u{FE0F}\u{20E3}', 7],
    ['an emoji-presentation heart', '\u{2764}\u{FE0F}', 6],
    [
      "England's tag-sequence flag",
      '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
      28,
    ],
    [
      'accented Latin and curly quotes as one each',
      '\u{201C}\u{E9}\u{201D}',
      3,
    ],
    ['Arabic beside an emoji', 'مرحبا \u{1F44B}', 10],
    // Over-counting is the safe direction: a text-presentation pictograph is
    // counted as its bytes too.
    ['a text-presentation pictograph as its bytes', '\u{A9}', 2],
  ])('counts %s', (_case, text, count) => {
    expect(countLength('threads', text)).toBe(count);
  });
});

describe('countLength for other providers', () => {
  it('keeps the weighted length on x', () => {
    const text = 'مرحبا \u{1F44B} hello';
    expect(countLength('x', text)).toBe(weightedLength(text));
  });

  it('keeps the plain length elsewhere', () => {
    expect(countLength('linkedin', 'مرحبا')).toBe(5);
  });
});
