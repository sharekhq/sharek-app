/**
 * Parses an NDJSON byte stream (the streamed video routes) into frames.
 * A frame can straddle two reads, so the trailing partial line is held back
 * until the rest arrives — dropping it would lose the `done` event and strand
 * a video the user has already been charged for. A final line without a
 * newline is still parsed when the stream ends, and lines that are not valid
 * JSON are skipped rather than allowed to kill the render.
 */
export async function* ndjsonFrames<T = any>(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const parse = (line: string): T[] => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        yield* parse(line);
      }
    }
    yield* parse(buffer);
  } finally {
    // The consumer can stop early (done frame seen); release the connection
    // instead of leaving the response half-read.
    await reader.cancel().catch(() => undefined);
  }
}
