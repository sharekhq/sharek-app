/**
 * Subtitle segmentation and timing for the Image Text Slides video pipeline.
 *
 * Cue offsets index the source string exactly as passed in, because that same
 * string is what goes to ElevenLabs — so a cue boundary can be looked up in the
 * returned character alignment rather than estimated from character counts.
 */

export interface Cue {
  text: string;
  /** Inclusive character offset into the source string. */
  from: number;
  /** Exclusive character offset into the source string. */
  to: number;
}

export interface TimedCue {
  text: string;
  /** Seconds from the start of this slide's audio. */
  start: number;
  end: number;
}

/**
 * Break candidates, best first. Rank decides which cut wins when several fit.
 * Arabic marks clauses with ، and ؛ and joins with standalone particles, so
 * both scripts are covered by the same three tiers.
 */
const BREAK_TIERS: { pattern: RegExp; rank: number }[] = [
  { pattern: /[.!?؟۔]\s/g, rank: 3 },
  { pattern: /[,،;؛:]\s/g, rank: 2 },
  { pattern: /\s(?:إلى|ثم|أو|لكن|حيث|and|or|then|but|to)\s/g, rank: 1 },
  { pattern: /\s/g, rank: 0 },
];

/**
 * A cut is only worth taking if it leaves a reasonably full line. Without this
 * a sentence end ten characters in would beat a comma at the end of the window
 * and orphan three words on their own row.
 */
const MIN_FILL = 0.5;

export function splitIntoCues(text: string, maxChars: number): Cue[] {
  const source = text;
  if (source.trim().length === 0) {
    return [];
  }
  if (source.trim().length <= maxChars) {
    const from = source.length - source.trimStart().length;
    return [{ text: source.trim(), from, to: from + source.trim().length }];
  }

  const candidates: { at: number; rank: number }[] = [];
  for (const { pattern, rank } of BREAK_TIERS) {
    for (const match of source.matchAll(pattern)) {
      candidates.push({ at: (match.index ?? 0) + match[0].length, rank });
    }
  }

  const cues: Cue[] = [];
  let start = 0;
  while (start < source.length) {
    while (start < source.length && /\s/.test(source[start])) start++;
    if (start >= source.length) break;

    if (source.length - start <= maxChars) {
      cues.push({ text: source.slice(start).trim(), from: start, to: source.length });
      break;
    }

    const limit = start + maxChars;
    const inRange = candidates.filter((c) => c.at > start && c.at <= limit);
    const wellFilled = inRange.filter((c) => c.at - start >= maxChars * MIN_FILL);
    const pool = wellFilled.length ? wellFilled : inRange;

    if (!pool.length) {
      // No break of any kind inside the window: cut on the character limit.
      cues.push({ text: source.slice(start, limit).trim(), from: start, to: limit });
      start = limit;
      continue;
    }

    const best = pool.reduce((a, b) =>
      b.rank > a.rank || (b.rank === a.rank && b.at > a.at) ? b : a
    );
    cues.push({ text: source.slice(start, best.at).trim(), from: start, to: best.at });
    start = best.at;
  }

  return cues.filter((c) => c.text.length > 0);
}

/** Subtitles drop the sentence-final stop; the spoken text keeps it. */
export function trimTrailingStop(text: string): string {
  return text.replace(/[.۔]\s*$/, '').trim();
}

export function timeCuesFromAlignment(
  cues: Cue[],
  alignment: {
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  },
  minSeconds: number
): TimedCue[] {
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const timed: TimedCue[] = [];
  let floor = 0;

  for (const cue of cues) {
    const startIndex = Math.min(cue.from, starts.length - 1);
    // `to` is the break point, which sits past the delimiter's trailing space,
    // so `to - 1` would time the silence after the cue rather than its last
    // spoken character. `text` is already trimmed, so its length lands exactly.
    const endIndex = Math.min(
      Math.max(cue.from + cue.text.length - 1, 0),
      ends.length - 1
    );
    const start = Math.max(starts[startIndex] ?? floor, floor);
    const end = Math.max(ends[endIndex] ?? start, start + minSeconds);
    timed.push({ text: trimTrailingStop(cue.text), start, end });
    floor = end;
  }

  return timed;
}

export function timeCuesByReading(
  cues: Cue[],
  charsPerSecond: number,
  minSeconds: number,
  maxSeconds: number
): TimedCue[] {
  const timed: TimedCue[] = [];
  let cursor = 0;

  for (const cue of cues) {
    const natural = cue.text.length / charsPerSecond;
    const duration = Math.min(Math.max(natural, minSeconds), maxSeconds);
    timed.push({ text: trimTrailingStop(cue.text), start: cursor, end: cursor + duration });
    cursor += duration;
  }

  return timed;
}
