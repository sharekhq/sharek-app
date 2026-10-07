// @ts-ignore
import twitter from 'twitter-text';

export const textSlicer = (
  integrationType: string,
  end: number,
  text: string
): { start: number; end: number } => {
  if (integrationType !== 'x') {
    return {
      start: 0,
      end,
    };
  }

  const { validRangeEnd, valid } = twitter.parseTweet(text, {
    version: 3,
    maxWeightedTweetLength: end,
    scale: 100,
    defaultWeight: 200,
    emojiParsingEnabled: true,
    transformedURLLength: 23,
    ranges: [
      { start: 0, end: 4351, weight: 100 },
      { start: 8192, end: 8205, weight: 100 },
      { start: 8208, end: 8223, weight: 100 },
      { start: 8242, end: 8247, weight: 100 },
    ],
  });

  return {
    start: 0,
    end: valid ? end : validRangeEnd,
  };
};

export const weightedLength = (text: string): number => {
  return twitter.parseTweet(text).weightedLength;
};

// One emoji sequence: a flag, a keycap, or a pictograph with its presentation
// selector or skin tone, joined by ZWJ and followed by any tag characters.
const EMOJI_SEQUENCE =
  /\p{RI}\p{RI}|[#*0-9]\u{FE0F}?\u{20E3}|\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?(?:\u{200D}\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?)*[\u{E0020}-\u{E007F}]*/gu;

// Threads counts an emoji as its UTF-8 bytes and every other character as one.
const threadsLength = (text: string): number => {
  const encoder = new TextEncoder();
  return (text.match(EMOJI_SEQUENCE) || []).reduce(
    (length, emoji) => length + encoder.encode(emoji).length - emoji.length,
    text.length
  );
};

export const countLength = (integrationType: string, text: string): number => {
  if (integrationType === 'x') {
    return weightedLength(text);
  }

  if (integrationType === 'threads') {
    return threadsLength(text);
  }

  return text.length;
};
