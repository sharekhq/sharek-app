import { formatDuration } from './format.duration';

describe('formatDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('pads seconds below ten', () => {
    expect(formatDuration(6)).toBe('0:06');
  });

  it('carries seconds into minutes', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('does not pad the minutes', () => {
    expect(formatDuration(600)).toBe('10:00');
  });

  it('formats the last second below an hour', () => {
    expect(formatDuration(3599)).toBe('59:59');
  });

  // A stream or a malformed file reports these. The caller renders nothing
  // rather than a duration of 0:00 it cannot stand behind.
  it('returns undefined for a duration that is not a number', () => {
    expect(formatDuration(NaN)).toBeUndefined();
  });

  it('returns undefined for an endless duration', () => {
    expect(formatDuration(Infinity)).toBeUndefined();
  });
});
