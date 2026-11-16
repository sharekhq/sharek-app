// The strip across the top of a post card holds the status chip, the post's tag
// names and the actions' ⋯, centred with a 10px gap between them. The tag names
// hide while the pointer is over the card; hidden with `display: none`, their
// box and its gap went, and the chip moved 5px. A post with no tags still drew
// the box, empty, so its gap left the chip 5px off centre. happy-dom has no
// layout: what is pinned is the strip's children and the box's classes, and the
// 0px is measured on the live calendar.
//
// The mocks are calendar.drag.layer.spec.tsx's, which renders the same card.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({}),
}));
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({ CreationMethodBadge: () => null })
);

import {
  CalendarPost,
  CalendarPostCard,
} from '@gitroom/frontend/components/launches/calendar.post.card';

const tag = (name: string, color = '') => ({ tag: { name, color } });

const post = (tags: Array<ReturnType<typeof tag>>) =>
  ({
    id: 'p1',
    content: '<p>Spring menu is out</p>',
    publishDate: '2099-09-17T10:00:00.000Z',
    state: 'DRAFT',
    intervalInDays: null,
    integration: { picture: '/pic.jpg', providerIdentifier: 'instagram' },
    tags,
  } as unknown as CalendarPost);

const mounted: Array<{ unmount: () => void }> = [];

const mount = (tags: Array<ReturnType<typeof tag>>, compact = false) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(
      <CalendarPostCard
        post={post(tags)}
        state="DRAFT"
        isBeforeNow={false}
        compact={compact}
        actions={<button aria-label="Post actions" />}
      />
    );
  });
  return host;
};

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

const strip = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).find((el) =>
    el.className.split(' ').includes('bg-surface2')
  )!;

// the card's body, under the strip: the part a click opens the post from
const body = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).find((el) =>
    el.className.split(' ').includes('bg-surface')
  )!;

const chip = (host: HTMLElement) => host.querySelector('.cal-chip')!;
const trigger = (host: HTMLElement) =>
  host.querySelector('[aria-label="Post actions"]')!;

describe("the post card's tag names", () => {
  it('draws no box for a post with no tags, so the chip sits centred', () => {
    const host = mount([]);
    const children = Array.from(strip(host).children);

    expect(children).toHaveLength(2);
    expect(children[0]).toBe(chip(host));
    expect(children[1]).toBe(trigger(host));
  });

  it('hides the names under the pointer keeping their space, so the chip stays still', () => {
    const host = mount([tag('Launch'), tag('Promo')]);
    const children = Array.from(strip(host).children);

    expect(children).toHaveLength(3);
    expect(children[0]).toBe(chip(host));
    expect(children[2]).toBe(trigger(host));
    const box = children[1];
    expect(box.textContent).toBe('Launch, Promo');
    const classes = box.className.split(' ');
    expect(classes).toContain('group-hover:invisible');
    expect(classes).not.toContain('group-hover:hidden');
    // on a touch screen the names stay hidden, as today
    expect(classes).toContain('coarse:hidden');
  });

  it('keeps the shadow on the names over a tag colour', () => {
    const host = mount([tag('Launch', '#2E7D6B')]);

    expect(strip(host).children[1].className.split(' ')).toContain(
      'text-shadow-tags'
    );
  });
});

// A box inside a card rounds at 8px (FR-023): the card, and its body's bottom
// corners on logical sides, so a month chip on a phone rounds whole at 8px too.
describe("the post card's corners", () => {
  it('rounds the card at 8px, not 10px', () => {
    const classes = (
      mount([]).firstElementChild as HTMLElement
    ).className.split(' ');

    expect(classes).toContain('rounded-[8px]');
    expect(classes).not.toContain('rounded-[10px]');
  });

  it("rounds the strip's top corners at 8px, the card's own", () => {
    const classes = strip(mount([])).className.split(' ');

    expect(classes).toContain('rounded-t-[8px]');
    expect(classes).not.toContain('rounded-tr-[10px]');
    expect(classes).not.toContain('rounded-tl-[10px]');
  });

  it("rounds the body's bottom corners at 8px, on logical sides", () => {
    const classes = body(mount([])).className.split(' ');

    expect(classes).toContain('rounded-b-[8px]');
    expect(classes).not.toContain('rounded-br-[10px]');
    expect(classes).not.toContain('rounded-bl-[10px]');
  });

  it("rounds a compact card's body whole at 8px under mobile", () => {
    const classes = body(mount([], true)).className.split(' ');

    expect(classes).toContain('mobile:rounded-[8px]');
    expect(classes).not.toContain('mobile:rounded-[10px]');
  });
});
