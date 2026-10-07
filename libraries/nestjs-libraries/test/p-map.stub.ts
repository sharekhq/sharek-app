// CJS stand-in for `p-map`, which ships ESM only, for the same reason as
// tokenx.stub.ts. @mastra/core runs part of every model step through it; this
// maps in order, one at a time, and ignores the concurrency option, which only
// changes timing. Mastra unwraps the default export itself, so the module is
// the function.
const pMap = async <T, R>(
  input: Iterable<T>,
  mapper: (item: T, index: number) => R | Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  let index = 0;
  for (const item of input) {
    results.push(await mapper(item, index++));
  }
  return results;
};

export = pMap;
