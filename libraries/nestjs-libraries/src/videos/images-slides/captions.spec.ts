import {
  splitIntoCues,
  timeCuesFromAlignment,
  timeCuesByReading,
  trimTrailingStop,
} from './captions';

describe('trimTrailingStop', () => {
  // Subtitles conventionally drop the full stop, and in RTL bidi puts it at the
  // far left of the line where it reads as a mistake. Only the display copy is
  // trimmed — the spoken text keeps it, because it is what makes TTS pause.
  it('drops a trailing full stop', () => {
    expect(trimTrailingStop('اشترك الآن.')).toBe('اشترك الآن');
    expect(trimTrailingStop('Subscribe now.')).toBe('Subscribe now');
  });

  it('keeps question and exclamation marks, which carry meaning', () => {
    expect(trimTrailingStop('حقاً؟')).toBe('حقاً؟');
    expect(trimTrailingStop('Now!')).toBe('Now!');
  });

  it('leaves text with no trailing stop alone', () => {
    expect(trimTrailingStop('اشترك الآن')).toBe('اشترك الآن');
  });
});

describe('splitIntoCues', () => {
  it('returns one cue when the text already fits', () => {
    const cues = splitIntoCues('اشترك الآن', 40);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toEqual({ text: 'اشترك الآن', from: 0, to: 10 });
  });

  it('offsets index the source string, so alignment lookups line up', () => {
    const source = 'One. Two. Three.';
    for (const cue of splitIntoCues(source, 9)) {
      expect(source.slice(cue.from, cue.to)).toContain(cue.text.slice(0, 3));
    }
  });

  it('prefers a sentence end over a comma', () => {
    expect(splitIntoCues('One, two. Three, four.', 12).map((c) => c.text)).toEqual([
      'One, two.',
      'Three, four.',
    ]);
  });

  it('falls back to a comma when there is no sentence end in range', () => {
    expect(
      splitIntoCues('one two three, four five six', 18).map((c) => c.text)
    ).toEqual(['one two three,', 'four five six']);
  });

  // Arabic marks its own clause boundary with ، and joins with إلى.
  it('breaks Arabic at its own punctuation', () => {
    const text = 'يقدم الموسم فعاليات، من الحفلات إلى الألعاب';
    const cues = splitIntoCues(text, 24);
    expect(cues[0].text).toBe('يقدم الموسم فعاليات،');
    expect(cues.length).toBeGreaterThan(1);
  });

  it('never emits a cue longer than the limit', () => {
    const text =
      'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu';
    for (const cue of splitIntoCues(text, 20)) {
      expect(cue.text.length).toBeLessThanOrEqual(20);
    }
  });

  it('breaks mid-clause on word boundaries when there is no punctuation at all', () => {
    const cues = splitIntoCues('alpha beta gamma delta epsilon zeta', 16);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) expect(cue.text).not.toMatch(/^\S*$/);
  });
});

describe('timeCuesFromAlignment', () => {
  // One character per 0.1s makes the expected numbers obvious.
  const alignmentFor = (text: string) => ({
    character_start_times_seconds: [...text].map((_, i) => i * 0.1),
    character_end_times_seconds: [...text].map((_, i) => (i + 1) * 0.1),
  });

  it('reads each cue boundary out of the alignment arrays', () => {
    const source = 'One. Two.';
    const cues = splitIntoCues(source, 5);
    const timed = timeCuesFromAlignment(cues, alignmentFor(source), 0);
    expect(timed[0].start).toBeCloseTo(0);
    expect(timed[0].end).toBeCloseTo(0.4);
    expect(timed[1].start).toBeCloseTo(0.5);
  });

  it('extends a cue that would flash, and pushes the next one back', () => {
    const source = 'Hi. There.';
    const cues = splitIntoCues(source, 5);
    const timed = timeCuesFromAlignment(cues, alignmentFor(source), 1.5);
    expect(timed[0].end - timed[0].start).toBeGreaterThanOrEqual(1.5);
    expect(timed[1].start).toBeGreaterThanOrEqual(timed[0].end);
  });

  it('drops the trailing full stop from what is displayed', () => {
    const source = 'Subscribe now.';
    const timed = timeCuesFromAlignment(
      splitIntoCues(source, 40),
      alignmentFor(source),
      0
    );
    expect(timed[0].text).toBe('Subscribe now');
  });
});

describe('timeCuesByReading', () => {
  it('lays cues end to end at reading pace', () => {
    const source = 'alpha beta. gamma delta.';
    const timed = timeCuesByReading(splitIntoCues(source, 12), 14, 2, 8);
    expect(timed[0].start).toBe(0);
    expect(timed[1].start).toBeCloseTo(timed[0].end);
  });

  it('clamps to the floor and the ceiling', () => {
    const timed = timeCuesByReading(splitIntoCues('Hi', 40), 14, 2, 8);
    expect(timed[0].end - timed[0].start).toBe(2);
  });
});
