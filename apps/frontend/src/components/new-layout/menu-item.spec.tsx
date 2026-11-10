// A menu item, in the drawer and on the desktop rail alike: every icon sits in
// a tile of one size, only the current page's tile is filled, and the current
// item says so to assistive tech (FR-013). No item has a background, on hover
// or otherwise, and every item shows a ring when it has keyboard focus
// (FR-029). The tile's colours are the selected tokens (colors.scss): the soft
// brand tint with a pomegranate icon in light, a solid pomegranate tile with a
// white icon in dark. The ring is focus only; on the current item it takes its
// own token, pomegranate in light and the light ink in dark, where a
// pomegranate ring beside the pomegranate tile would vanish.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('next/navigation', () => ({
  usePathname: () => '/launches',
}));
// Scenery: next/link's prefetch needs browser APIs happy-dom does not have.
// The anchor keeps the attributes under test.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    className,
    'aria-current': current,
  }: {
    children: ReactNode;
    className?: string;
    'aria-current'?: 'page';
  }) => (
    <a className={className} aria-current={current}>
      {children}
    </a>
  ),
}));

import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (path: string, onClick?: () => void) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <MenuItem label="Calendar" icon={<svg />} path={path} onClick={onClick} />
    );
  });
  return host.firstElementChild as HTMLElement;
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/);

// The icon's tile is the item's first child; the label is its last.
const tileOf = (item: Element) => item.firstElementChild as HTMLElement;

// Every background class, plain or behind a variant such as hover:.
const backgroundsOf = (el: Element) =>
  classesOf(el).filter((c) => /(^|:)bg-/.test(c));

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe.each([
  ['link', undefined],
  ['button', () => undefined],
])('a menu item rendered as a %s', (_kind, onClick) => {
  it('marks the current page with aria-current and a filled icon tile only, and keeps it on hover', async () => {
    const item = await render('/launches', onClick);
    const tile = tileOf(item);

    expect(item.getAttribute('aria-current')).toBe('page');
    expect(classesOf(tile)).toEqual(
      expect.arrayContaining(['bg-selectedBg', 'text-selectedText'])
    );
    expect(backgroundsOf(tile)).toEqual(['bg-selectedBg']);
    expect(classesOf(item)).toContain('text-textItemFocused');
    expect(backgroundsOf(item)).toEqual([]);
    expect(classesOf(item)).not.toContain('hover:text-textItemFocused');
    // dark's --brand-text is the rose the brand rules out
    [item, tile].forEach((el) => {
      expect(classesOf(el)).not.toContain('text-brandText');
      expect(classesOf(el)).not.toContain('bg-brandSoft2');
    });
  });

  it('leaves another page grey, darkening on hover with no background, and no aria-current', async () => {
    const item = await render('/media', onClick);
    const tile = tileOf(item);

    expect(item.hasAttribute('aria-current')).toBe(false);
    expect(classesOf(item)).toEqual(
      expect.arrayContaining([
        'text-textItemBlur',
        'hover:text-textItemFocused',
      ])
    );
    expect(backgroundsOf(item)).toEqual([]);
    expect(backgroundsOf(tile)).toEqual([]);
    expect(classesOf(tile)).not.toContain('text-selectedText');
  });

  it('holds the icon in a centred 40px tile, 36px in short windows, that marking does not resize', async () => {
    const currentItem = await render('/launches', onClick);
    const otherItem = await render('/media', onClick);
    const mark = ['bg-selectedBg', 'text-selectedText'];

    [currentItem, otherItem].forEach((item) => {
      const tile = tileOf(item);

      expect(item.children).toHaveLength(2);
      expect(tile.querySelector('svg')).not.toBeNull();
      expect(classesOf(tile)).toEqual(
        expect.arrayContaining([
          'w-[40px]',
          'h-[40px]',
          'custom:w-[36px]',
          'custom:h-[36px]',
          'rounded-[12px]',
          'flex',
          'items-center',
          'justify-center',
        ])
      );
    });
    // the mark is colour alone: apart from it, the two tiles are the same
    expect(
      classesOf(tileOf(currentItem))
        .filter((c) => !mark.includes(c))
        .sort()
    ).toEqual(classesOf(tileOf(otherItem)).sort());
  });

  it('no longer scales the icon: its tile changes colour only', async () => {
    const item = await render('/launches', onClick);
    const everyClass = [
      item,
      ...Array.from(item.querySelectorAll('*')),
    ].flatMap(classesOf);

    expect(everyClass.filter((c) => c.includes('scale-'))).toEqual([]);
    expect(everyClass).not.toContain('transition-transform');
    expect(classesOf(tileOf(item))).toContain('transition-colors');
  });

  it('spaces tile and label as the rail does: 4px top, 6px bottom, 5px between, 2px in short windows', async () => {
    const item = await render('/media', onClick);
    const classes = classesOf(item);

    expect(classes).toEqual(
      expect.arrayContaining([
        'pt-[4px]',
        'pb-[6px]',
        'px-[4px]',
        'gap-[5px]',
        'custom:py-[2px]',
        'custom:gap-[2px]',
      ])
    );
    // the tile sets the height: no height floor, no other padding or gap
    expect(
      classes.filter((c) => /(^|:)(min-h|py|gap)-/.test(c)).sort()
    ).toEqual(['custom:gap-[2px]', 'custom:py-[2px]', 'gap-[5px]']);
  });

  it.each([
    [
      'current',
      '/launches',
      'focus-visible:ring-selectedRing',
      'focus-visible:ring-brand',
    ],
    [
      'other',
      '/media',
      'focus-visible:ring-brand',
      'focus-visible:ring-selectedRing',
    ],
  ])(
    'shows a ring on keyboard focus only, %s item',
    async (_state, path, ring, otherRing) => {
      const item = await render(path, onClick);
      const classes = classesOf(item);

      expect(classes).toEqual(
        expect.arrayContaining(['focus-visible:ring-2', ring])
      );
      expect(classes).not.toContain(otherRing);
      expect(classes.filter((c) => c.includes('ring-offset-'))).toEqual([]);
      expect(
        classes.filter(
          (c) => c.includes('ring') && !c.startsWith('focus-visible:')
        )
      ).toEqual([]);
    }
  );

  it('keeps the 13px nowrap label as the last child, after the tile', async () => {
    const item = await render('/launches', onClick);
    const label = item.lastElementChild as HTMLElement;

    expect(classesOf(label)).toEqual(
      expect.arrayContaining(['text-[13px]', 'whitespace-nowrap'])
    );
  });
});
