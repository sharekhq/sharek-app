import { act, createRef, FC, RefObject } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream 53d796ec. The mention list lives inside `.dropdown-menu`, whose
// global rule (global.scss, `.dropdown-menu button`) paints every row
// transparent with more specificity than a plain Tailwind background class, so
// the row picked with the arrow keys never showed. The picked row carries the
// list's own hover colour with the important modifier instead. Sharek's own
// colours for the list (2775f59a left out) are pinned beside it.
//
// The list is not exported: TipTap builds it through ReactRenderer, so the
// renderer is replaced by one that hands the component over.
type Item = { id: string; label: string; image: string };
type Handle = { onKeyDown: (props: { event: { key: string } }) => boolean };
type ListProps = {
  items: Item[];
  command: () => void;
  ref: RefObject<Handle | null>;
};
let MentionList: FC<ListProps> | undefined;

jest.mock('@tiptap/react', () => ({
  ReactRenderer: class {
    element = document.createElement('div');
    constructor(component: FC<ListProps>) {
      MentionList = component;
    }
    updateProps() {}
    destroy() {}
  },
  posToDOMRect: () => ({}),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { suggestion } from '@gitroom/frontend/components/new-launch/mention.component';

const roots: Array<{ unmount: () => void }> = [];

const items: Item[] = [
  { id: 'a', label: 'Ada', image: '' },
  { id: 'b', label: 'Bilal', image: '' },
  { id: 'c', label: 'Chen', image: '' },
];

const renderList = () => {
  // onBeforeStart builds the renderer; an editor without a view skips the
  // positioning.
  suggestion(async () => [])
    .render()
    .onBeforeStart({ editor: {} });
  const ref = createRef<Handle>();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const List = MentionList!;
  act(() => {
    root.render(<List items={items} command={() => {}} ref={ref} />);
  });
  return { host, ref };
};

const rows = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button')) as HTMLButtonElement[];

const press = (ref: RefObject<Handle | null>, key: string) =>
  act(() => {
    ref.current.onKeyDown({ event: { key } });
  });

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the mention list', () => {
  it('marks the first row as picked when it opens', () => {
    const { host } = renderList();

    expect(rows(host)[0].className).toContain('!bg-newBgLineColor');
    expect(rows(host)[1].className).not.toContain('!bg-newBgLineColor');
  });

  it('moves the picked row with the arrow keys', () => {
    const { host, ref } = renderList();

    press(ref, 'ArrowDown');
    press(ref, 'ArrowDown');

    expect(
      rows(host).map((row) => row.className.includes('!bg-newBgLineColor'))
    ).toEqual([false, false, true]);

    press(ref, 'ArrowUp');

    expect(rows(host)[1].className).toContain('!bg-newBgLineColor');
  });

  // The global rule repaints a hovered row itself; a hover class on the row
  // would be dead weight under it.
  it('leaves hovering to the global dropdown rule', () => {
    const { host } = renderList();

    expect(rows(host).some((row) => /hover:bg-/.test(row.className))).toBe(
      false
    );
  });

  it("keeps Sharek's colours for the list", () => {
    const { host } = renderList();
    const menu = host.querySelector('.dropdown-menu')!;

    expect(menu.className).toContain('bg-surface');
    expect(menu.className).toContain('border-line');
    expect(host.querySelector('button div')!.className).toContain('text-ink');
  });
});
