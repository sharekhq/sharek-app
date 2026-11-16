import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Slider } from './slider';

type Value = 'on' | 'off';

// The switch is four nested boxes: the click box a finger can hit, the pill it
// looks like, the track inside the pill's padding, and the knob riding on it.
const parts = (value: Value) => {
  const markup = renderToStaticMarkup(
    <Slider value={value} onChange={() => undefined} />
  );
  const classes = [...markup.matchAll(/class="([^"]*)"/g)].map((m) =>
    m[1].split(/\s+/)
  );
  if (classes.length !== 4) {
    throw new Error(`expected four boxes in: ${markup}`);
  }
  const [box, pill, , knob] = classes;
  return { box, pill, knob, all: classes.flat() };
};

describe('Slider', () => {
  describe.each(['off', 'on'] as const)('%s', (value) => {
    it('draws a 44x24 pill with 2px of padding', () => {
      expect(parts(value).pill).toEqual(
        expect.arrayContaining(['w-[44px]', 'h-[24px]', 'p-[2px]'])
      );
    });

    it('draws an 18px knob from the start side', () => {
      expect(parts(value).knob).toEqual(
        expect.arrayContaining(['w-[18px]', 'h-[18px]', 'start-0'])
      );
    });

    // Rule 6: a physical side would leave the knob on the wrong end in Arabic.
    it('places nothing by a physical left', () => {
      expect(parts(value).all.filter((c) => c.startsWith('left-'))).toEqual([]);
    });

    it('keeps the 44px click box under a coarse pointer', () => {
      expect(parts(value).box).toEqual(
        expect.arrayContaining(['cursor-pointer', 'coarse:min-h-[44px]'])
      );
    });
  });

  // The track is 44 - 2 (border) - 4 (padding) = 38px; the knob travels 38 - 18.
  it('moves the knob 20px towards the end side when on, mirrored in Arabic', () => {
    expect(parts('on').knob).toEqual(
      expect.arrayContaining(['translate-x-[20px]', 'rtl:-translate-x-[20px]'])
    );
  });

  it('leaves the knob at the start side when off', () => {
    expect(parts('off').knob.filter((c) => c.includes('translate-x-'))).toEqual(
      []
    );
  });

  it('keeps its colours', () => {
    expect(parts('on').pill).toEqual(
      expect.arrayContaining(['bg-brand', 'border-brand'])
    );
    expect(parts('off').pill).toEqual(
      expect.arrayContaining(['bg-surface2', 'border-line'])
    );
    expect(parts('on').knob).toEqual(
      expect.arrayContaining(['bg-white', 'border-line'])
    );
  });

  it.each([
    ['off', 'on'],
    ['on', 'off'],
  ] as const)('flips %s to %s on a click', (value, next) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onChange = jest.fn();

    act(() => {
      root.render(<Slider value={value} onChange={onChange} />);
    });
    act(() => {
      host.firstElementChild?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(next);
    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
