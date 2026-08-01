import { ndjsonFrames } from './ndjson.frames';

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};

const collect = async (body: ReadableStream<Uint8Array>) => {
  const frames = [];
  for await (const frame of ndjsonFrames(body)) frames.push(frame);
  return frames;
};

describe('ndjsonFrames', () => {
  it('parses one frame per line', async () => {
    expect(
      await collect(streamOf('{"name":"heartbeat"}\n{"name":"done"}\n'))
    ).toEqual([{ name: 'heartbeat' }, { name: 'done' }]);
  });

  it('reassembles a frame that straddles two reads', async () => {
    expect(
      await collect(streamOf('{"name":"do', 'ne","media":{"id":"1"}}\n'))
    ).toEqual([{ name: 'done', media: { id: '1' } }]);
  });

  it('parses a final frame that arrives without a trailing newline', async () => {
    expect(await collect(streamOf('{"name":"done"}'))).toEqual([
      { name: 'done' },
    ]);
  });

  it('skips blank lines and lines that are not JSON', async () => {
    expect(await collect(streamOf('\nnot json\n{"name":"done"}\n'))).toEqual([
      { name: 'done' },
    ]);
  });

  it('handles a multi-byte character split across reads (Arabic payloads)', async () => {
    const bytes = new TextEncoder().encode('{"message":"مرحبا"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 13)); // cuts inside م's UTF-8 pair
        controller.enqueue(bytes.slice(13));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ message: 'مرحبا' }]);
  });

  it('cancels the stream when the consumer exits early', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"name":"done"}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const frame of ndjsonFrames<{ name: string }>(body)) {
      if (frame.name === 'done') break;
    }
    expect(cancelled).toBe(true);
  });
});
