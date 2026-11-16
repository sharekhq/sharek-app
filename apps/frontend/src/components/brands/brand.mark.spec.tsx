import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  BrandMark,
  LOGO_TILE_DARK,
  LOGO_TILE_LIGHT,
  logoTone,
} from '@gitroom/frontend/components/brands/brand.mark';
import { Brand } from '@gitroom/frontend/components/brands/use.brands';

jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));

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

// A brand as GET /brands gives it, as brands.component.spec.tsx builds one.
const brand = (
  id: string,
  name: string,
  logo: Brand['kit']['logo'] = null,
  kit: Partial<Brand['kit']> = {},
  about: string | null = null
) =>
  ({
    id,
    name,
    kit: {
      logo,
      examples: [],
      colours: [],
      headingFont: null,
      bodyFont: null,
      ...kit,
    },
    details: {
      about,
      toneOfVoice: null,
      postLanguage: null,
      callToAction: null,
      hashtags: null,
    },
  } as Brand);

// The read's tones outlive a mark, by src, so each case's logo has a path of
// its own.
const withLogo = (path: string) =>
  brand('b1', 'Bayt Al Qahwa', { id: 'm1', path, missing: false });

const MARK = 'h-[32px] w-[32px] rounded-[8px]';

const mounted: Root[] = [];

const mount = (value: Brand) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<BrandMark brand={value} className={MARK} />);
  });
  return host;
};

// happy-dom has no 2D canvas, so each case hands the read a context of its
// own (or none), and afterEach puts the original back.
const canvas = window.HTMLCanvasElement.prototype;
const getContext = canvas.getContext;
const stubContext = (context: unknown) => {
  canvas.getContext = jest.fn(() => context) as never;
};
const sample = (data: Uint8ClampedArray) => ({
  drawImage: jest.fn(),
  getImageData: () => ({ data }),
});

const fire = (img: HTMLImageElement, type: 'load' | 'error') => {
  act(() => {
    img.dispatchEvent(new Event(type));
  });
};

// A tile as the test DOM writes it, which may not be the notation the
// constant gives (D3).
const painted = (tile: typeof LOGO_TILE_DARK) => {
  const probe = document.createElement('div');
  Object.assign(probe.style, tile);
  return probe.style;
};

describe('BrandMark', () => {
  let logged: jest.SpyInstance[];

  beforeEach(() => {
    logged = [
      jest.spyOn(console, 'error').mockImplementation(() => undefined),
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    canvas.getContext = getContext;
    jest.restoreAllMocks();
  });

  it('renders the live logo as its own image, asked for with CORS so it can be read', () => {
    const img = mount(withLogo('/logo-cors.png')).querySelector('img')!;

    expect(img.getAttribute('src')).toBe('/logo-cors.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('crossorigin')).toBe('anonymous');
    expect(img.getAttribute('class')!.split(' ')).toEqual([
      'flex-none',
      'object-contain',
      'p-[3px]',
      'bg-surface2',
      ...MARK.split(' '),
    ]);
    expect(img.getAttribute('style')).toBeNull();
  });

  it('puts a white logo on the fixed dark tile once it loads', () => {
    stubContext(sample(pixels([[300, WHITE]])));
    const img = mount(withLogo('/logo-white.png')).querySelector('img')!;

    fire(img, 'load');

    expect(img.style.backgroundColor).toBe(
      painted(LOGO_TILE_DARK).backgroundColor
    );
    expect(img.style.boxShadow).toBe('');
  });

  it('puts a near-black logo on the fixed light tile with its line', () => {
    stubContext(sample(pixels([[300, NEAR_BLACK]])));
    const img = mount(withLogo('/logo-black.png')).querySelector('img')!;

    fire(img, 'load');

    const tile = painted(LOGO_TILE_LIGHT);
    expect(img.style.backgroundColor).toBe(tile.backgroundColor);
    expect(img.style.boxShadow).toBe(tile.boxShadow);
  });

  it('keeps a coloured logo on its tile, with no style', () => {
    stubContext(sample(pixels([[300, RED]])));
    const img = mount(withLogo('/logo-red.png')).querySelector('img')!;

    fire(img, 'load');

    expect(canvas.getContext).toHaveBeenCalled();
    expect(img.getAttribute('style')).toBeNull();
  });

  it('gives no tone, and logs nothing, where the canvas has no 2D context', () => {
    stubContext(null);
    const img = mount(withLogo('/logo-no-context.png')).querySelector('img')!;

    fire(img, 'load');

    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      willReadFrequently: true,
    });
    expect(img.getAttribute('style')).toBeNull();
    logged.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('gives no tone, and logs nothing, where reading the pixels throws', () => {
    const getImageData = jest.fn(() => {
      throw new DOMException('The canvas is tainted', 'SecurityError');
    });
    stubContext({ drawImage: jest.fn(), getImageData });
    const img = mount(withLogo('/logo-tainted.png')).querySelector('img')!;

    fire(img, 'load');

    expect(getImageData).toHaveBeenCalled();
    expect(img.getAttribute('style')).toBeNull();
    logged.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('keeps the same classes before and after the read, so only the style changes', () => {
    stubContext(sample(pixels([[300, WHITE]])));
    const img = mount(withLogo('/logo-classes.png')).querySelector('img')!;
    const before = img.getAttribute('class');

    fire(img, 'load');

    expect(img.getAttribute('style')).not.toBeNull();
    expect(img.getAttribute('class')).toBe(before);
  });

  it('loads the logo again without CORS where the CORS request fails, with no tile', () => {
    stubContext(sample(pixels([[300, WHITE]])));
    const img = mount(withLogo('/logo-no-cors.png')).querySelector('img')!;
    expect(img.getAttribute('crossorigin')).toBe('anonymous');

    fire(img, 'error');

    expect(img.hasAttribute('crossorigin')).toBe(false);
    expect(img.getAttribute('style')).toBeNull();
  });

  it('draws a logo it has read before on its tile from the first render', () => {
    stubContext(sample(pixels([[300, WHITE]])));
    fire(mount(withLogo('/logo-again.png')).querySelector('img')!, 'load');

    const again = mount(withLogo('/logo-again.png')).querySelector('img')!;

    expect(again.style.backgroundColor).toBe(
      painted(LOGO_TILE_DARK).backgroundColor
    );
  });

  it("shows the brand's initial while it has no live logo", () => {
    const none = mount(brand('b2', 'noor Dental'));
    const missing = mount(
      brand('b3', 'Rawda Florist', {
        id: 'm3',
        path: '/gone.png',
        missing: true,
      })
    );

    [none, missing].forEach((host) => {
      expect(host.querySelector('img')).toBeNull();
    });
    expect(none.querySelector('span')!.textContent).toBe('N');
    expect(missing.querySelector('span')!.textContent).toBe('R');
  });
});
