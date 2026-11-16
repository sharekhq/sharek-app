import { logoTone } from '@gitroom/frontend/components/brands/brand.mark';
import {
  LOGO_TILE_DARK,
  LOGO_TILE_LIGHT,
} from '@gitroom/frontend/components/brands/brand.website';

// A brand's small logo tile (spec 060, US3, FR-011 to FR-015, SC-003): the
// mark reads its logo's pixels on a 32 × 32 sample and puts a light logo on a
// fixed dark tile and a dark one on a fixed light tile; a coloured, mixed or
// unreadable one keeps today's tile. logoTone is that read's rule (research
// R1, data-model.md): visible pixels are alpha 128 and up; under 1% see-through
// is a logo with its own background; light is luminance 0.5 and up, dark 0.1
// and down; 90% of the visible pixels decide.

type Pixel = [number, number, number, number];

const SAMPLE = 32 * 32;
const WHITE: Pixel = [255, 255, 255, 255];
const NEAR_BLACK: Pixel = [18, 18, 18, 255];
const RED: Pixel = [226, 35, 26, 255];
const GREEN: Pixel = [46, 125, 50, 255];
const SEE_THROUGH: Pixel = [0, 0, 0, 0];
const grey = (hex: string): Pixel => {
  const level = parseInt(hex.slice(1, 3), 16);
  return [level, level, level, 255];
};

// A 32 × 32 RGBA sample from runs of one colour, the rest see-through.
const pixels = (runs: Array<[number, Pixel]>) => {
  const data = new Uint8ClampedArray(SAMPLE * 4);
  let at = 0;
  for (const [count, pixel] of runs) {
    for (let i = 0; i < count; i++) {
      data.set(pixel, at);
      at += 4;
    }
  }
  for (; at < data.length; at += 4) {
    data.set(SEE_THROUGH, at);
  }
  return data;
};

describe('logoTone', () => {
  it('reads a white logo on a see-through ground as light', () => {
    expect(logoTone(pixels([[300, WHITE]]))).toBe('light');
  });

  it('reads a near-black logo on a see-through ground as dark', () => {
    expect(logoTone(pixels([[300, NEAR_BLACK]]))).toBe('dark');
  });

  it('gives no tone to a coloured logo', () => {
    expect(logoTone(pixels([[300, RED]]))).toBeNull();
  });

  it('gives no tone to a logo half white and half green', () => {
    expect(
      logoTone(
        pixels([
          [150, WHITE],
          [150, GREEN],
        ])
      )
    ).toBeNull();
  });

  it('keeps a white logo with a small red dot light (96.7% white)', () => {
    expect(
      logoTone(
        pixels([
          [290, WHITE],
          [10, RED],
        ])
      )
    ).toBe('light');
  });

  it('gives no tone to a logo just under 90% white (89.7%)', () => {
    expect(
      logoTone(
        pixels([
          [269, WHITE],
          [31, RED],
        ])
      )
    ).toBeNull();
  });

  it('gives no tone to a logo with no see-through pixel', () => {
    expect(logoTone(pixels([[SAMPLE, WHITE]]))).toBeNull();
  });

  it('gives no tone with 10 see-through pixels of 1,024 (under 1%)', () => {
    expect(logoTone(pixels([[SAMPLE - 10, WHITE]]))).toBeNull();
  });

  it('reads a logo with 11 see-through pixels of 1,024 by its visible ones', () => {
    expect(logoTone(pixels([[SAMPLE - 11, WHITE]]))).toBe('light');
  });

  it('counts pixels under half opacity as see-through, so a faint logo has no tone', () => {
    expect(logoTone(pixels([[300, [255, 255, 255, 100]]]))).toBeNull();
  });

  it('gives no tone to an empty image', () => {
    expect(logoTone(pixels([]))).toBeNull();
  });

  it('reads #C0C0C0 as light and #A0A0A0 as neither', () => {
    expect(logoTone(pixels([[300, grey('#C0C0C0')]]))).toBe('light');
    expect(logoTone(pixels([[300, grey('#A0A0A0')]]))).toBeNull();
  });

  it('reads #505050 as dark and #707070 as neither', () => {
    expect(logoTone(pixels([[300, grey('#505050')]]))).toBe('dark');
    expect(logoTone(pixels([[300, grey('#707070')]]))).toBeNull();
  });
});

// The two fixed tiles, the same in both themes as CHECKERBOARD is: a white
// logo on the dark one is 15.36:1, a black one on the light one 19.32:1.
describe('the logo tiles', () => {
  it('draws a light logo on a fixed dark tile', () => {
    expect(LOGO_TILE_DARK).toEqual({ backgroundColor: '#2A2326' });
  });

  it('draws a dark logo on a fixed light tile with a 1px line', () => {
    expect(LOGO_TILE_LIGHT).toEqual({
      backgroundColor: '#F7F5F4',
      boxShadow: 'inset 0 0 0 1px rgba(26, 20, 19, 0.08)',
    });
  });
});
