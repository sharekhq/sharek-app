// A menu item, in the drawer and on the desktop rail alike: the current page
// sits on its own tile and says so to assistive tech (FR-013), keeps that look
// on hover, and every item shows a ring when it has keyboard focus (FR-029).
// The tile's colours are the nav-current tokens (colors.scss): the soft brand
// tint with pomegranate text in light, a solid pomegranate tile with white in
// dark. The ring is focus only; on the current tile it takes its own token,
// pomegranate in light and the light ink in dark, where a pomegranate ring on
// the pomegranate tile would vanish.
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
  it('marks the current page with aria-current and the nav-current tile, and keeps it on hover', async () => {
    const item = await render('/launches', onClick);

    expect(item.getAttribute('aria-current')).toBe('page');
    expect(classesOf(item)).toEqual(
      expect.arrayContaining(['bg-navCurrentBg', 'text-navCurrentText'])
    );
    // dark's --brand-text is the rose the brand rules out
    expect(classesOf(item)).not.toContain('text-brandText');
    expect(classesOf(item)).not.toContain('bg-brandSoft2');
    expect(classesOf(item)).not.toContain('hover:bg-boxFocused');
    expect(classesOf(item)).not.toContain('hover:text-textItemFocused');
  });

  it('leaves another page grey, with its hover tile and no aria-current', async () => {
    const item = await render('/media', onClick);

    expect(item.hasAttribute('aria-current')).toBe(false);
    expect(classesOf(item)).not.toContain('bg-navCurrentBg');
    expect(classesOf(item)).toEqual(
      expect.arrayContaining([
        'hover:bg-boxFocused',
        'hover:text-textItemFocused',
      ])
    );
  });

  it.each([
    [
      'current',
      '/launches',
      'focus-visible:ring-navCurrentRing',
      'focus-visible:ring-brand',
    ],
    [
      'other',
      '/media',
      'focus-visible:ring-brand',
      'focus-visible:ring-navCurrentRing',
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

  it('keeps the 13px nowrap label', async () => {
    const item = await render('/launches', onClick);
    const label = item.lastElementChild as HTMLElement;

    expect(classesOf(label)).toEqual(
      expect.arrayContaining(['text-[13px]', 'whitespace-nowrap'])
    );
  });
});
