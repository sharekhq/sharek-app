import { withHeartbeat } from './heartbeat';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* emit(items: { delay: number; value: string }[]) {
  for (const item of items) {
    await sleep(item.delay);
    yield item.value;
  }
}

const collect = async (iterable: AsyncIterable<string>) => {
  const out: string[] = [];
  for await (const value of iterable) {
    out.push(value);
  }
  return out;
};

describe('withHeartbeat', () => {
  it('passes source items through untouched when the source is fast', async () => {
    const out = await collect(
      withHeartbeat(
        emit([
          { delay: 0, value: 'a' },
          { delay: 0, value: 'b' },
        ]),
        200,
        () => 'beat'
      )
    );
    expect(out).toEqual(['a', 'b']);
  });

  it('injects heartbeats while the source is silent', async () => {
    const out = await collect(
      withHeartbeat(
        emit([
          { delay: 0, value: 'a' },
          { delay: 180, value: 'b' },
        ]),
        50,
        () => 'beat'
      )
    );
    expect(out[0]).toBe('a');
    expect(out[out.length - 1]).toBe('b');
    expect(out.filter((v) => v === 'beat').length).toBeGreaterThanOrEqual(2);
  });

  it('propagates source errors', async () => {
    async function* bad() {
      yield 'a';
      throw new Error('boom');
    }
    await expect(collect(withHeartbeat(bad(), 50, () => 'beat'))).rejects.toThrow(
      'boom'
    );
  });

  it('closes the source when the consumer stops early', async () => {
    let closed = false;
    async function* src() {
      try {
        yield 'a';
        await sleep(1000);
        yield 'b';
      } finally {
        closed = true;
      }
    }
    const iterator = withHeartbeat(src(), 20, () => 'beat')[
      Symbol.asyncIterator
    ]();
    expect((await iterator.next()).value).toBe('a');
    await iterator.return!(undefined);
    expect(closed).toBe(true);
  });
});
