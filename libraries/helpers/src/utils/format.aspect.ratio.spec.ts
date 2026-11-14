import { formatAspectRatio } from './format.aspect.ratio';

describe('formatAspectRatio', () => {
  it('names a story or reel 9:16', () => {
    expect(formatAspectRatio(1080, 1920)).toBe('9:16');
  });

  it('names a portrait feed post 4:5', () => {
    expect(formatAspectRatio(1080, 1350)).toBe('4:5');
  });

  // A resize rounds a side by a pixel; the shape is still the one it was made
  // as (0.07% off 4:5).
  it('names a portrait feed post a pixel short 4:5', () => {
    expect(formatAspectRatio(1080, 1349)).toBe('4:5');
  });

  it('names a square 1:1', () => {
    expect(formatAspectRatio(1000, 1000)).toBe('1:1');
  });

  it('names a banner 16:9', () => {
    expect(formatAspectRatio(1920, 1080)).toBe('16:9');
  });

  it('names a link image 1.91:1', () => {
    expect(formatAspectRatio(1200, 628)).toBe('1.91:1');
  });

  it('names 5:4', () => {
    expect(formatAspectRatio(1280, 1024)).toBe('5:4');
  });

  it('names an upright phone photo 3:4', () => {
    expect(formatAspectRatio(3024, 4032)).toBe('3:4');
  });

  it('names a sideways phone photo 4:3', () => {
    expect(formatAspectRatio(4032, 3024)).toBe('4:3');
  });

  it('names a tall AI image 2:3', () => {
    expect(formatAspectRatio(1024, 1536)).toBe('2:3');
  });

  it('names a wide AI image 3:2', () => {
    expect(formatAspectRatio(1536, 1024)).toBe('3:2');
  });

  it('names a shape 0.9% off a common one after it', () => {
    expect(formatAspectRatio(1009, 1000)).toBe('1:1');
  });

  // Past 1% the label stops naming a common shape the file isn't close to.
  it('does not name a shape 1.1% off a common one after it', () => {
    expect(formatAspectRatio(1011, 1000)).toBe('1.01:1');
  });

  it('reads a tall uncommon shape as 1 over its longer side', () => {
    expect(formatAspectRatio(1000, 1234)).toBe('1:1.23');
  });

  it('reads a wide uncommon shape as its longer side over 1', () => {
    expect(formatAspectRatio(2400, 1000)).toBe('2.4:1');
  });

  it('drops trailing zeros from an uncommon shape', () => {
    expect(formatAspectRatio(2000, 1000)).toBe('2:1');
  });

  // Before a file loads, or when it fails to, the browser reports these. The
  // caller renders no shape rather than one it cannot stand behind.
  it('returns undefined for a side of zero', () => {
    expect(formatAspectRatio(0, 1080)).toBeUndefined();
    expect(formatAspectRatio(1080, 0)).toBeUndefined();
  });

  it('returns undefined for a negative side', () => {
    expect(formatAspectRatio(-1080, 1920)).toBeUndefined();
    expect(formatAspectRatio(1080, -1920)).toBeUndefined();
  });

  it('returns undefined for a side that is not a number', () => {
    expect(formatAspectRatio(NaN, 1080)).toBeUndefined();
    expect(formatAspectRatio(1080, NaN)).toBeUndefined();
  });

  it('returns undefined for an endless side', () => {
    expect(formatAspectRatio(Infinity, 1080)).toBeUndefined();
    expect(formatAspectRatio(1080, Infinity)).toBeUndefined();
  });
});
