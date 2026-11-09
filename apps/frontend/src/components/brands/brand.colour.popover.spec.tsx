import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The colours card's + and the popover it opens (spec 053, FR-013, boards
// ColourPicker and ColourPickerAR): react-colorful's colour square and hue
// bar, its hex field with the # shown, a live swatch, Cancel and Add. Add takes
// only a full #RRGGBB code the kit doesn't hold yet and hands it on uppercase,
// as the kit stores it; a code it refuses leaves Add disabled and says
// nothing. The test DOM has no layout, so placement and sizes are pinned by
// the classes that carry them.
//
// useT gives the key, so each case names the string it expects.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));

import { BrandColourPopover } from '@gitroom/frontend/components/brands/brand.colour.popover';

const onAdd = jest.fn();
const mounted: Root[] = [];

const render = (colours: string[], dir: 'ltr' | 'rtl' = 'ltr') => {
  const host = document.createElement('div');
  host.setAttribute('dir', dir);
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<BrandColourPopover colours={colours} onAdd={onAdd} />);
  });
};

const plus = () =>
  document.querySelector<HTMLButtonElement>(
    'button[aria-label="brands_add_colour"]'
  );
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const field = () => dialog()!.querySelector('input')!;
// the swatch sits before the field, as the boards draw it
const swatch = () => field().previousElementSibling as HTMLElement;
const action = (name: string) =>
  Array.from(dialog()!.querySelectorAll('button')).find(
    (button) => button.textContent === name
  )!;

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const open = () => click(plus()!);
const type = async (input: HTMLInputElement, text: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const escape = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
  });
};

// How the test DOM writes a colour into a style, whichever notation it keeps.
const painted = (colour: string) => {
  const probe = document.createElement('span');
  probe.style.backgroundColor = colour;
  return probe.style.backgroundColor;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  onAdd.mockReset();
});

describe('the colours card +', () => {
  it('is a 44px square with the app focus ring', () => {
    render([]);

    expect(plus()!.className.split(' ')).toEqual(
      expect.arrayContaining([
        'w-[44px]',
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('opens a popover anchored to it with the colour square, the hue bar and a hex field showing #', async () => {
    render([]);
    expect(plus()!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(plus()!.getAttribute('aria-expanded')).toBe('false');
    expect(dialog()).toBeNull();

    await open();

    expect(plus()!.getAttribute('aria-expanded')).toBe('true');
    expect(dialog()!.getAttribute('aria-label')).toBe('brands_add_colour');
    expect(dialog()!.textContent).toContain('brands_add_colour');
    // hung from the +'s own wrapper, so it opens beside it wherever it sits
    expect(dialog()!.parentElement).toBe(plus()!.parentElement);
    expect(dialog()!.parentElement!.className.split(' ')).toContain('relative');
    expect(dialog()!.className.split(' ')).toContain('absolute');
    expect(
      dialog()!.querySelector('.react-colorful .react-colorful__saturation')
    ).toBeTruthy();
    expect(
      dialog()!.querySelector('.react-colorful .react-colorful__hue')
    ).toBeTruthy();
    expect(field().getAttribute('aria-label')).toBe('brands_hex_code');
    // HexColorInput `prefixed`: an empty field still shows its #
    expect(field().value).toBe('#');
    expect(document.activeElement).toBe(field());
    expect(action('add').disabled).toBe(true);
  });

  it('keeps the colour square and the hex field left to right in Arabic', async () => {
    render([], 'rtl');
    await open();

    expect(
      dialog()!.querySelector('.react-colorful')!.getAttribute('dir')
    ).toBe('ltr');
    expect(field().getAttribute('dir')).toBe('ltr');
  });

  it('paints a typed code in the swatch, and Add hands it on uppercase and closes', async () => {
    render(['#3B2417']);
    await open();

    for (const typed of ['#b', '#b5', '#b55', '#b554', '#b5542', '#b5542c']) {
      await type(field(), typed);
    }

    expect(swatch().style.backgroundColor).toBe(painted('#b5542c'));
    expect(action('add').disabled).toBe(false);

    await click(action('add'));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('#B5542C');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(plus());
  });

  it('takes a code pasted after the field’s #', async () => {
    render([]);
    await open();

    await type(field(), '##b5542c');

    expect(swatch().style.backgroundColor).toBe(painted('#b5542c'));
    await click(action('add'));
    expect(onAdd).toHaveBeenCalledWith('#B5542C');
  });

  it.each([
    ['five digits', '#b5542'],
    ['three digits', '#abc'],
    ['no hex digits', '#zzzzzz'],
    ['nothing', ''],
  ])('keeps Add disabled for a code with %s', async (_case, typed) => {
    render([]);
    await open();

    await type(field(), typed);

    expect(action('add').disabled).toBe(true);
    await click(action('add'));
    expect(onAdd).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
  });

  it('refuses a colour the kit already holds, in either case, without a word', async () => {
    render(['#3B2417', '#B5542C']);
    await open();
    const words = dialog()!.textContent;

    await type(field(), '#b5542c');

    expect(action('add').disabled).toBe(true);
    await click(action('add'));
    expect(onAdd).not.toHaveBeenCalled();
    expect(dialog()!.textContent).toBe(words);
    expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
  });

  it('is gone once the kit holds six colours', () => {
    render(['#111111', '#222222', '#333333', '#444444', '#555555']);
    expect(plus()).toBeTruthy();
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';

    render(['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']);

    expect(plus()).toBeNull();
    expect(document.body.textContent).toBe('');
  });

  it('closes on Cancel without adding, and opens afresh', async () => {
    render([]);
    await open();
    await type(field(), '#b5542c');

    await click(action('cancel'));

    expect(dialog()).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
    expect(plus()!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(plus());

    await open();
    expect(field().value).toBe('#');
    expect(action('add').disabled).toBe(true);
  });

  it('closes on Escape, keeps the key from the page behind and gives the focus back to the +', async () => {
    render([]);
    await open();
    await type(field(), '#b5542c');
    const heard = jest.fn();
    document.addEventListener('keydown', heard);

    await escape(field());

    document.removeEventListener('keydown', heard);
    expect(dialog()).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(plus());
  });

  it('closes on a press outside it, and on the + pressed again', async () => {
    render([]);
    await open();

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true })
      );
    });
    expect(dialog()).toBeNull();

    await open();
    await open();
    expect(dialog()).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
