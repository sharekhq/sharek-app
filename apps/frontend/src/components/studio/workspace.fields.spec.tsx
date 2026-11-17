import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  ChoiceField,
  FieldLabel,
  OrientationField,
} from '@gitroom/frontend/components/studio/workspace.fields';

// The field parts every tool's settings share (contracts/workspace-parts.md
// §4, FR-004): the label and hint pair each field repeats today, the
// Orientation row the AI image and AI video windows both draw with AspectTile,
// and the equal secondary buttons Veo 3's Audio and Image Text Slides' count
// draw. They take words, never keys: each caller translates its own.

const mounted: Root[] = [];

const mount = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(element);
  });
  return host;
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') || '').split(' ');
const byText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('div')).find(
    (node) => node.textContent === text && node.children.length === 0
  );
const buttons = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button'));
const follows = (
  later: Node | null | undefined,
  earlier: Node | null | undefined
) =>
  !!later &&
  !!earlier &&
  !!(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('FieldLabel', () => {
  it('draws the label semibold at 14px, the hint muted at 12px, then its children', async () => {
    const host = await mount(
      <FieldLabel label="Reference images" hint="Optional: up to 3 images.">
        <span data-testid="field">the field</span>
      </FieldLabel>
    );

    const label = byText(host, 'Reference images');
    const hint = byText(host, 'Optional: up to 3 images.');
    const field = host.querySelector('[data-testid="field"]');

    expect(tokens(label)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-[600]'])
    );
    expect(tokens(hint)).toEqual(
      expect.arrayContaining(['text-[12px]', 'text-muted'])
    );
    expect(follows(hint, label)).toBe(true);
    expect(follows(field, hint)).toBe(true);
  });

  it('draws no hint line when it is given none', async () => {
    const host = await mount(
      <FieldLabel label="Style">
        <span>the field</span>
      </FieldLabel>
    );

    expect(byText(host, 'Style')).toBeDefined();
    expect(host.querySelector('.text-muted')).toBeNull();
  });
});

describe('OrientationField', () => {
  const options = [
    {
      id: 'portrait',
      label: 'Portrait',
      ratio: '9:16',
      glyph: { width: 13, height: 23 },
      tooltipHtml: 'Stories and Reels',
    },
    {
      id: 'square',
      label: 'Square',
      ratio: '1:1',
      glyph: { width: 18, height: 18 },
      tooltipHtml: 'Feed posts',
    },
    {
      id: 'landscape',
      label: 'Landscape',
      ratio: '16:9',
      glyph: { width: 23, height: 13 },
      tooltipHtml: 'YouTube and LinkedIn',
    },
  ];

  const render = (onChange = jest.fn()) =>
    mount(
      <OrientationField
        label="Orientation"
        options={options}
        value="square"
        onChange={onChange}
      />
    );

  it('draws its label, then one AspectTile per option with its name and ratio', async () => {
    const host = await render();
    const label = byText(host, 'Orientation');
    const tiles = buttons(host);

    expect(tokens(label)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-[600]'])
    );
    expect(tiles).toHaveLength(3);
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'Portrait9:16',
      'Square1:1',
      'Landscape16:9',
    ]);
    tiles.forEach((tile) => expect(follows(tile, label)).toBe(true));
  });

  it('marks the chosen option selected and the others not', async () => {
    const host = await render();

    expect(
      buttons(host).map((tile) => tile.getAttribute('aria-pressed'))
    ).toEqual(['false', 'true', 'false']);
    expect(tokens(buttons(host)[1])).toEqual(
      expect.arrayContaining(['bg-brandSoft', 'border-brand'])
    );
  });

  it('passes each option its tooltip', async () => {
    const host = await render();

    expect(
      buttons(host).map((tile) => [
        tile.getAttribute('data-tooltip-id'),
        tile.getAttribute('data-tooltip-html'),
      ])
    ).toEqual([
      ['tooltip', 'Stories and Reels'],
      ['tooltip', 'Feed posts'],
      ['tooltip', 'YouTube and LinkedIn'],
    ]);
  });

  it('calls onChange with the id of the option picked', async () => {
    const onChange = jest.fn();
    const host = await render(onChange);

    await click(buttons(host)[2]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('landscape');
  });
});

describe('ChoiceField', () => {
  const options = [
    { id: 'ambient', label: 'Ambient' },
    { id: 'narration', label: 'Narration' },
    { id: 'none', label: 'Silent' },
  ];
  const CHOSEN = ['!bg-brandSoft', '!text-brandText', '!border-brand'];

  const render = (props: Partial<Parameters<typeof ChoiceField>[0]> = {}) =>
    mount(
      <ChoiceField
        label="Audio"
        options={options}
        value="narration"
        onChange={jest.fn()}
        {...props}
      />
    );

  it('draws its label, then one equal secondary Button per option', async () => {
    const host = await render();
    const label = byText(host, 'Audio');
    const choices = buttons(host);

    expect(tokens(label)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-[600]'])
    );
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Ambient',
      'Narration',
      'Silent',
    ]);
    choices.forEach((choice) => {
      expect(follows(choice, label)).toBe(true);
      expect(choice.getAttribute('type')).toBe('button');
      // The secondary variant's own classes, as buttonClassName writes them.
      expect(tokens(choice)).toEqual(
        expect.arrayContaining(['bg-quiet', 'border', 'border-line', '!flex-1'])
      );
    });
  });

  // Spec 044's phone fit, ported from image-text-slides.provider.spec's
  // count row (tasks D15 b): at the Button's 16px sides six counts ran past a
  // 390px phone, so at 1025px and below each one may shrink and takes 8px.
  it('shares the row equally at 1025px and below and keeps the desktop buttons', async () => {
    const host = await render({
      options: ['1', '2', '3', '4', '5', '6'].map((id) => ({ id, label: id })),
      value: '4',
    });

    expect(buttons(host)).toHaveLength(6);
    buttons(host).forEach((choice) =>
      expect(tokens(choice)).toEqual(
        expect.arrayContaining([
          '!flex-1',
          'px-[16px]',
          'mobile:min-w-0',
          'mobile:px-[8px]',
        ])
      )
    );
  });

  it('draws the chosen option in the brand tint with its border and aria-pressed, the others plain', async () => {
    const host = await render();
    const [ambient, narration, none] = buttons(host);

    expect(tokens(narration)).toEqual(expect.arrayContaining(CHOSEN));
    expect(narration.getAttribute('aria-pressed')).toBe('true');
    [ambient, none].forEach((choice) => {
      expect(tokens(choice).filter((name) => CHOSEN.includes(name))).toEqual(
        []
      );
      expect(choice.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('draws the hint muted at 12px under the row when given one, as Veo 3 draws its Audio hint', async () => {
    const host = await render({
      hint: 'A voiceover describing the scene.',
    });
    const hint = byText(host, 'A voiceover describing the scene.');

    expect(tokens(hint)).toEqual(
      expect.arrayContaining(['text-[12px]', 'text-muted'])
    );
    buttons(host).forEach((choice) => expect(follows(hint, choice)).toBe(true));
  });

  it('draws no hint line when it is given none', async () => {
    const host = await render();

    expect(host.querySelector('.text-muted')).toBeNull();
  });

  it('calls onChange with the id of the option clicked', async () => {
    const onChange = jest.fn();
    const host = await render({ onChange });

    await click(buttons(host)[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ambient');
  });
});
