/**
 * Wraps an async iterable and yields a heartbeat value whenever the source
 * stays silent for `intervalMs`. Streamed HTTP responses (the generator
 * endpoint) need bytes flowing continuously: nginx and Cloudflare cut
 * connections that go quiet for ~60-100s, and the image-generation step can
 * easily stay silent longer than that.
 */
export async function* withHeartbeat<T, H>(
  source: AsyncIterable<T>,
  intervalMs: number,
  heartbeat: () => H
): AsyncGenerator<T | H> {
  const iterator = source[Symbol.asyncIterator]();
  const silence = Symbol('silence');
  try {
    let pending = iterator.next();
    for (;;) {
      let timer!: ReturnType<typeof setTimeout>;
      const gap = new Promise<typeof silence>((resolve) => {
        timer = setTimeout(() => resolve(silence), intervalMs);
      });
      const result = await Promise.race([pending, gap]);
      clearTimeout(timer);
      if (result === silence) {
        yield heartbeat();
        continue;
      }
      if (result.done) {
        return;
      }
      yield result.value;
      pending = iterator.next();
    }
  } finally {
    // The consumer can stop early (client disconnect); close the source so
    // the underlying generation is cancelled rather than left running.
    await iterator.return?.().catch(() => undefined);
  }
}
