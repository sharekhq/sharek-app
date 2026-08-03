/**
 * `m:ss` for a media duration in seconds.
 *
 * Returns `undefined` when the browser reports a duration it cannot stand
 * behind — `NaN` before metadata arrives, `Infinity` for a stream — so callers
 * omit the time rather than print a confident `0:00`.
 */
export const formatDuration = (seconds: number): string | undefined => {
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
