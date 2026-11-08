import { act, ComponentProps, FC, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';
import i18next from 'i18next';

// The calendar's top bar (spec 051, R8, contracts/pages-ui.md's Calendar
// part). Above 1025px it reads, in order: Today, Previous and Next named for
// the view, the date in words, the notice while channels are hidden, one
// segmented control for Day, Week, Month and List, and Create Post. At 1025px
// and below it is two rows: the Channels chip and Create Post, then Today,
// Previous, Next, the short date and a view button whose menu offers the four
// views. The customer picker and the funnel are gone, because the channel
// list is the calendar's filter now (FR-011).
//
// The test DOM applies no media queries, so the width rules are pinned by the
// classes that carry them (the emitted CSS is read by tools/tailwind-emit).
// useT runs on i18next with the real en and ar files, so each case reads the
// words a user sees, and dayjs follows i18next's language as the app's layout
// sets it up (html.component.tsx).
type Customer = { id: string; name: string };
type Channel = {
  id: string;
  internalId: string;
  name: string;
  picture: string;
  identifier: string;
  type: string;
  disabled: boolean;
  customer: Customer | null;
};

jest.mock('@gitroom/frontend/components/launches/calendar.context', () => {
  const { createContext, useContext } = jest.requireActual('react');
  const CalendarContext = createContext(undefined);
  return {
    CalendarContext,
    useCalendar: () => useContext(CalendarContext),
  };
});
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, defaultValue?: string, values?: Record<string, unknown>) =>
      mockT(key, defaultValue, values),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true } }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled: true, showUpstreamExtras: false }),
}));
// Create Post, the generator and Add Channel are scenery: what is under test is
// where the bar puts them, not what they open (the generator's gate is
// launches.generator.gate.spec.tsx's).
jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => <div data-testid="new-post" />,
}));
jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => <div data-testid="generator" />,
}));
const mockAddProvider = jest.fn();
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    AddProviderButton: (props: { update?: () => void }) => {
      mockAddProvider(props);
      return <div data-testid="add-provider" />;
    },
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ src, alt, className }: Record<string, string>) => (
    <i
      data-mock="ImageWithFallback"
      data-src={src}
      data-alt={alt}
      className={className}
    />
  ),
}));
// The bar counts what's hidden through the channel list's one usable rule
// (C20), so a case can swap the rule and see the bar follow it.
const mockIsUsable = jest.fn();
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/launches/channel.panel'),
  isUsable: (...args: unknown[]) => mockIsUsable(...args),
}));

import { CalendarContext } from '@gitroom/frontend/components/launches/calendar.context';
import { Filters } from '@gitroom/frontend/components/launches/filters';
// dayjs takes i18next's language from the layout's listener, with the
// locales it loads; the Arabic one runs without preParsePostFormat, so its
// digits stay Latin.
import '@gitroom/frontend/components/layout/html.component';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

// The real calendar context extends dayjs with isoWeek, which the bar's weeks
// are measured in; the mock above leaves it out.
dayjs.extend(isoWeek);

const mockT = (
  key: string,
  defaultValue?: string,
  values?: Record<string, unknown>
) => i18next.t(key, { defaultValue, ...values });

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: readLocale('en') },
      ar: { translation: readLocale('ar') },
    },
  });
});

const ACME: Customer = { id: 'c1', name: 'Acme' };
const OTHER: Customer = { id: 'c2', name: 'Other' };
const channel = (
  id: string,
  customer: Customer | null = null,
  disabled = false
): Channel => ({
  id,
  internalId: `internal-${id}`,
  name: `channel ${id}`,
  picture: `/avatar-${id}.png`,
  identifier: 'x',
  type: 'social',
  disabled,
  customer,
});
// Ten channels across two customers, one of them disabled.
const TEN = [
  channel('a', ACME),
  channel('b', ACME),
  channel('c', ACME),
  channel('d', OTHER),
  channel('e', OTHER),
  channel('f'),
  channel('g'),
  channel('h'),
  channel('i'),
  channel('j', null, true),
];
// Every channel's id but these.
const allBut = (...hidden: string[]) =>
  TEN.map(({ id }) => id).filter((id) => !hidden.includes(id));

const mockSetFilters = jest.fn();
const mockSetListState = jest.fn();
const mockSetListPage = jest.fn();
const mockOpenChannels = jest.fn();
const mockUpdate = jest.fn();
// Every channel selection the bar hands the calendar, in order.
const picks: Array<string[] | null> = [];

type Start = {
  display?: string;
  startDate?: string;
  endDate?: string;
  integrations?: Channel[];
  selectedChannels?: string[] | null;
  listPage?: number;
  listTotalPages?: number;
};

// The calendar's context, holding the channel selection in state as the real
// provider does, and the page's open state for the channel sheet; everything
// else is fixed for the mount.
const Harness: FC<{ start: Start }> = ({ start }) => {
  const [selectedChannels, setSelectedChannels] = useState<string[] | null>(
    start.selectedChannels ?? null
  );
  const [channelsOpen, setChannelsOpen] = useState(false);
  const calendar = {
    // a week in the past, so no view button is already on its own range
    display: 'week',
    startDate: '2020-01-06',
    endDate: '2020-01-12',
    integrations: TEN,
    customer: null,
    listPage: 0,
    listTotalPages: 1,
    listState: 'all',
    setListState: mockSetListState,
    setListPage: mockSetListPage,
    ...start,
    selectedChannels,
    setSelectedChannels: (next: string[] | null) => {
      picks.push(next);
      setSelectedChannels(next);
    },
    setFilters: mockSetFilters,
  };
  return (
    <CalendarContext.Provider
      value={
        calendar as unknown as ComponentProps<
          typeof CalendarContext.Provider
        >['value']
      }
    >
      <Filters
        onOpenChannels={() => {
          mockOpenChannels();
          setChannelsOpen(true);
        }}
        channelsOpen={channelsOpen}
        update={mockUpdate}
      />
    </CalendarContext.Provider>
  );
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async (start: Start = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<Harness start={start} />);
  });
  return host;
};

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);

// The innermost element that reads exactly `text`.
const byText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll<HTMLElement>('*')).find(
    (el) => el.children.length === 0 && el.textContent === text
  );
const byLabel = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const buttons = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('button'));
// Today, the button that reads it.
const today = (host: HTMLElement) =>
  buttons(host).find((b) => b.textContent === 'Today');
// The four views' buttons in the segmented control above 1025px.
const viewButtons = (host: HTMLElement) =>
  buttons(host).filter((b) => b.hasAttribute('aria-pressed'));
// The view button at 1025px and below, named for the current view.
const viewButton = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]')).find(
    (el) => (el.getAttribute('aria-label') ?? '').startsWith('View: ')
  );
const menuItems = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
// The Channels chip, found by its name.
const chip = (host: HTMLElement) =>
  buttons(host).find((b) =>
    (b.getAttribute('aria-label') ?? '').startsWith('Channels: ')
  );
// The date as the bar prints it: the wide words and the phone's short form.
const dates = (host: HTMLElement) => {
  const spans = Array.from(host.querySelectorAll('span'));
  return {
    long: spans.find((s) => s.className === 'mobile:hidden'),
    short: spans.find((s) => s.className === 'hidden mobile:inline'),
  };
};
// A list-state segment: the label, and the element that takes its tap.
const segment = (host: HTMLElement, label: string) => {
  const pill = byText(host, label);
  return { pill, target: pill?.parentElement };
};
// The date and pager arrows are drawn by these two paths.
const arrows = (host: HTMLElement) =>
  Array.from(
    host.querySelectorAll(
      'path[d="M6.5 11L1.5 6L6.5 1"], path[d="M1.5 11L6.5 6L1.5 1"]'
    )
  ).map((p) => p.closest('svg')!.parentElement as HTMLElement);
const count = (host: HTMLElement, id: string) =>
  host.querySelectorAll(`[data-testid="${id}"]`).length;
const lastFilters = () =>
  mockSetFilters.mock.calls[mockSetFilters.mock.calls.length - 1]?.[0];
// `b` comes after `a` in the document.
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const FOCUS_RING = ['focus-visible:ring-2', 'focus-visible:ring-brand'];

beforeEach(async () => {
  mockSetFilters.mockClear();
  mockSetListState.mockClear();
  mockSetListPage.mockClear();
  mockOpenChannels.mockClear();
  mockAddProvider.mockClear();
  mockIsUsable
    .mockReset()
    .mockImplementation(
      jest.requireActual('@gitroom/frontend/components/launches/channel.panel')
        .isUsable
    );
  picks.length = 0;
  await i18next.changeLanguage('en');
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the top bar above 1025px', () => {
  it('reads Today, Previous, Next, the date, the view control and Create Post, in that order', async () => {
    const host = await mount({
      startDate: '2026-11-09',
      endDate: '2026-11-15',
      selectedChannels: allBut('b'),
    });
    const notice = byText(host, 'Show all')!;
    const order = [
      today(host),
      byLabel(host, 'Previous week'),
      byLabel(host, 'Next week'),
      dates(host).long,
      notice,
      ...viewButtons(host),
      host.querySelector('[data-testid="new-post"]'),
    ];

    order.forEach((node) => expect(node).toBeTruthy());
    order
      .slice(1)
      .forEach((node, index) =>
        expect(follows(order[index]!, node!)).toBe(true)
      );
  });

  it.each([
    ['day', '2020-01-06', '2020-01-06', 'Previous day', 'Next day'],
    ['week', '2020-01-06', '2020-01-12', 'Previous week', 'Next week'],
    ['month', '2020-01-01', '2020-01-31', 'Previous month', 'Next month'],
  ])(
    'names Previous and Next for the %s view, as buttons',
    async (display, startDate, endDate, previous, next) => {
      const host = await mount({ display, startDate, endDate });

      [previous, next].forEach((label) => {
        const button = byLabel(host, label);
        expect(button?.tagName).toBe('BUTTON');
        expect(button!.getAttribute('type')).toBe('button');
        expect(classes(button)).toEqual(expect.arrayContaining(FOCUS_RING));
      });
    }
  );

  it('steps a week back and forward from Previous and Next', async () => {
    const host = await mount();

    await click(byLabel(host, 'Previous week')!);
    expect(lastFilters()).toEqual(
      expect.objectContaining({
        startDate: '2019-12-30',
        endDate: '2020-01-05',
        display: 'week',
      })
    );

    await click(byLabel(host, 'Next week')!);
    expect(lastFilters()).toEqual(
      expect.objectContaining({ startDate: '2020-01-13', display: 'week' })
    );
  });

  it('makes Today a button with a focus ring', async () => {
    const host = await mount();

    expect(today(host)).toBeDefined();
    expect(today(host)!.getAttribute('type')).toBe('button');
    expect(classes(today(host))).toEqual(expect.arrayContaining(FOCUS_RING));
  });

  it.each([
    ['week', '2026-11-09', '2026-11-15', '9 – 15 November 2026'],
    ['week', '2026-11-30', '2026-12-06', '30 November – 6 December 2026'],
    ['week', '2025-12-29', '2026-01-04', '29 December 2025 – 4 January 2026'],
    ['day', '2026-11-11', '2026-11-11', 'Wednesday, 11 November 2026'],
    ['month', '2026-11-01', '2026-11-30', 'November 2026'],
  ])(
    'reads the %s from %s to %s in words: %s',
    async (display, startDate, endDate, words) => {
      const host = await mount({ display, startDate, endDate });

      expect(dates(host).long?.textContent).toBe(words);
    }
  );

  it('reads the week in Arabic words with Latin digits', async () => {
    await i18next.changeLanguage('ar');
    const host = await mount({
      startDate: '2026-11-09',
      endDate: '2026-11-15',
    });

    expect(dates(host).long?.textContent).toBe('9 – 15 نوفمبر 2026');
    expect(dates(host).long?.textContent).not.toMatch(/[٠-٩]/);
  });

  describe('the notice', () => {
    it('says how many channels show while one is hidden, and Show all shows every channel', async () => {
      const host = await mount({ selectedChannels: allBut('b') });
      const showAll = byText(host, 'Show all')!;
      const notice = showAll.parentElement!;

      expect(showAll.tagName).toBe('BUTTON');
      expect(showAll.getAttribute('type')).toBe('button');
      expect(classes(showAll)).toEqual(expect.arrayContaining(FOCUS_RING));
      expect(notice.textContent).toBe('9 of 10 channels·Show all');
      expect(classes(notice)).toContain('mobile:hidden');

      await click(showAll);

      expect(picks).toEqual([null]);
      expect(byText(host, 'Show all')).toBeUndefined();
    });

    it('reads in Arabic', async () => {
      await i18next.changeLanguage('ar');
      const host = await mount({ selectedChannels: allBut('b') });

      expect(byText(host, 'عرض الكل')!.parentElement!.textContent).toBe(
        'القنوات الظاهرة: 9 من 10·عرض الكل'
      );
    });

    it.each([
      ['every channel shows', null],
      ['the array holds every usable channel', allBut('j')],
      ['a deleted channel’s id is left in the array', [...allBut(), 'gone']],
    ])('is not there when %s', async (_, selectedChannels) => {
      const host = await mount({ selectedChannels });

      expect(byText(host, 'Show all')).toBeUndefined();
      expect(host.textContent).not.toMatch(/of 10 channels/);
    });

    // T043 review, finding 4: a channel the list can't tick always shows,
    // whatever the rule's reason.
    it("counts what's hidden through the channel list's usable rule", async () => {
      mockIsUsable.mockImplementation((channel: Channel) => channel.id !== 'b');
      const host = await mount({ selectedChannels: allBut('b') });

      expect(mockIsUsable).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b' }),
        'calendar'
      );
      expect(byText(host, 'Show all')).toBeUndefined();
      expect(host.textContent).not.toMatch(/of 10 channels/);
    });
  });

  describe('the view control', () => {
    it('is one segmented control of Day, Week, Month and List, the chosen one pressed and heavier', async () => {
      const host = await mount();
      const views = viewButtons(host);

      expect(views.map((b) => b.textContent)).toEqual([
        'Day',
        'Week',
        'Month',
        'List',
      ]);
      expect(views.map((b) => b.getAttribute('aria-pressed'))).toEqual([
        'false',
        'true',
        'false',
        'false',
      ]);
      views.forEach((b) => {
        expect(b.getAttribute('type')).toBe('button');
        expect(classes(b)).toEqual(expect.arrayContaining(FOCUS_RING));
        expect(classes(b).includes('font-[600]')).toBe(
          b.textContent === 'Week'
        );
      });
      const control = views[0].parentElement!;
      expect(views.every((b) => b.parentElement === control)).toBe(true);
      expect(classes(control)).toContain('mobile:hidden');
    });

    // As the board draws them. Four 74px pills made the control 306px wide,
    // so with the notice shown the bar's one row needed 1035px and Create
    // Post fell to a row of its own below a 1477px screen (T042 Look, M4).
    it('makes each view as wide as its word, 12px either side, with 2px between views', async () => {
      const host = await mount();
      const views = viewButtons(host);

      views.forEach((b) => {
        expect(classes(b)).toContain('px-[12px]');
        expect(classes(b).filter((name) => /^(min-)?w-/.test(name))).toEqual(
          []
        );
      });
      expect(classes(views[0].parentElement)).toContain('gap-[2px]');
    });

    // A word that short leaves its pill under the 44px touch target: Arabic's
    // يوم (Day) was 42 by 44 on a touch screen (walk 2, step 15). The pills
    // stretch to the control's 54px less its 4px padding and 1px border, so
    // they are 44px tall, and each holds a 44px width on touch.
    it('holds each view at 44 by 44px at least on a touch screen', async () => {
      const host = await mount();
      const views = viewButtons(host);

      views.forEach((b) => expect(classes(b)).toContain('coarse:min-w-[44px]'));
      expect(classes(views[0].parentElement)).toEqual(
        expect.arrayContaining(['coarse:min-h-[54px]', 'p-[4px]', 'border'])
      );
    });

    it.each([
      ['Day', 'day'],
      ['Week', 'week'],
      ['Month', 'month'],
      ['List', 'list'],
    ])('opens the %s view', async (label, view) => {
      const host = await mount();

      await click(viewButtons(host).find((b) => b.textContent === label)!);

      expect(lastFilters()?.display).toBe(view);
    });

    it('stays in the List view with List pressed, and opens the week from Week', async () => {
      const host = await mount({ display: 'list' });
      const views = viewButtons(host);

      expect(classes(views[0].parentElement)).not.toContain('hidden');
      expect(
        views.find((b) => b.getAttribute('aria-pressed') === 'true')
          ?.textContent
      ).toBe('List');

      await click(views.find((b) => b.textContent === 'Week')!);

      expect(lastFilters()?.display).toBe('week');
    });

    it('has no calendar and list icon pair', async () => {
      const host = await mount();

      expect(host.querySelector('path[d^="M15.75 7.41667"]')).toBeNull();
      expect(host.querySelector('path[d^="M17.5 10L7.5 10"]')).toBeNull();
    });
  });

  // The maintainer's "Two groups" (T042 Look, M4): the bar wraps only between
  // its two groups, each held on one line, so where they don't fit side by
  // side the second drops under the first, at the end, at any width, and no
  // control is ever left alone on a row.
  describe('the two groups', () => {
    const groups = (host: HTMLElement) => ({
      bar: host.firstElementChild!,
      navigation: today(host)!.parentElement!,
      end: host.querySelector('[data-testid="new-post"]')!.parentElement!
        .parentElement!,
    });
    const wraps = (node: Element) =>
      classes(node).some((name) => name.startsWith('flex-wrap'));

    it('holds Today, Previous, Next and the date in the first, and the notice, the views and Create Post in the second', async () => {
      const host = await mount({ selectedChannels: allBut('b') });
      const { bar, navigation, end } = groups(host);

      // the two are all the bar shows above 1025px
      expect(
        Array.from(bar.children).filter(
          (child) => !classes(child).includes('hidden')
        )
      ).toEqual([navigation, end]);
      [
        today(host),
        byLabel(host, 'Previous week'),
        byLabel(host, 'Next week'),
        dates(host).long,
      ].forEach((node) => expect(navigation.contains(node!)).toBe(true));
      [
        byText(host, 'Show all'),
        ...viewButtons(host),
        host.querySelector('[data-testid="new-post"]'),
      ].forEach((node) => expect(end.contains(node!)).toBe(true));
    });

    it('wraps the bar between them only, each held on one line, the second at the end', async () => {
      const host = await mount({ selectedChannels: allBut('b') });
      const { bar, navigation, end } = groups(host);
      const create = host.querySelector('[data-testid="new-post"]')!
        .parentElement!;

      expect(classes(bar)).toEqual(
        expect.arrayContaining(['flex', 'flex-wrap', 'gap-[8px]'])
      );
      expect(wraps(navigation)).toBe(false);
      expect(wraps(end)).toBe(false);
      expect(classes(end)).toEqual(
        expect.arrayContaining(['flex', 'items-center', 'gap-[8px]', 'ms-auto'])
      );
      // Create Post keeps its words on one line when the group is tight
      expect(classes(create)).toContain('shrink-0');
    });

    // At 1025px and below the second group lets its children be the bar's
    // own, so Create Post sits beside the chip as it did.
    it('dissolves the second group at 1025px and below', async () => {
      const host = await mount();

      expect(classes(groups(host).end)).toContain('mobile:contents');
    });

    // On its own row the second group can still be wider than the bar: 596px
    // in English with the notice against 589 on a 1030px screen. It never runs
    // past the bar; the notice's count gives way first and the rest keep
    // their size (the maintainer's call).
    it('cuts the notice’s count first when the second group is wider than the bar, its full words in its title', async () => {
      const host = await mount({ selectedChannels: allBut('b') });
      const { end } = groups(host);
      const showAll = byText(host, 'Show all')!;
      const words = byText(host, '9 of 10 channels')!;

      expect(classes(end)).toEqual(
        expect.arrayContaining(['min-w-0', 'max-w-full'])
      );
      expect(classes(showAll.parentElement)).toContain('min-w-0');
      expect(classes(words)).toContain('truncate');
      // the cut is drawn only: a reader and the title get every word
      expect(words.getAttribute('title')).toBe('9 of 10 channels');
      [
        showAll.parentElement!.querySelector('svg'),
        showAll,
        viewButtons(host)[0].parentElement,
        host.querySelector('[data-testid="new-post"]')!.parentElement,
      ].forEach((node) => expect(classes(node)).toContain('shrink-0'));
    });
  });

  it('ends with Create Post, and shows none with no channels', async () => {
    const host = await mount();
    const create = host.querySelector('[data-testid="new-post"]')!;

    expect(count(host, 'new-post')).toBe(1);
    viewButtons(host).forEach((b) => expect(follows(b, create)).toBe(true));

    const empty = await mount({ integrations: [] });
    expect(count(empty, 'new-post')).toBe(0);
  });

  it('has no customer picker and no filter button', async () => {
    const host = await mount({ selectedChannels: allBut('b') });

    expect(
      host.querySelector('[data-tooltip-content="Select Customer"]')
    ).toBeNull();
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(
      buttons(host).filter((b) =>
        (b.getAttribute('aria-label') ?? '').startsWith('Select Channels')
      )
    ).toHaveLength(0);
    // the funnel's path, ui/icons' FilterIcon
    expect(host.querySelector('path[d^="M2.5 4.16667H17.5"]')).toBeNull();
    expect(host.textContent).not.toMatch(/Select Customer|Select Channels/);
  });
});

describe('the first row at 1025px and below', () => {
  it('opens with the Channels chip: three overlapped pictures and the count, named for it', async () => {
    const host = await mount();
    const button = chip(host);

    expect(button).toBeDefined();
    expect(button!.getAttribute('type')).toBe('button');
    expect(button!.getAttribute('aria-label')).toBe('Channels: 10');
    expect(button!.getAttribute('aria-expanded')).toBe('false');
    expect(classes(button)).toEqual(
      expect.arrayContaining([
        'hidden',
        'mobile:flex',
        'mobile:order-1',
        'h-[44px]',
        ...FOCUS_RING,
      ])
    );
    const pictures = Array.from(
      button!.querySelectorAll('[data-mock="ImageWithFallback"]')
    );
    expect(pictures.map((p) => p.getAttribute('data-src'))).toEqual([
      '/avatar-a.png',
      '/avatar-b.png',
      '/avatar-c.png',
    ]);
    pictures.forEach((p) => expect(p.getAttribute('data-alt')).toBe(''));
    // overlapped from the start edge, which is the right in Arabic
    expect(classes(pictures[0])).not.toContain('-ms-[10px]');
    expect(classes(pictures[1])).toContain('-ms-[10px]');
    expect(classes(pictures[2])).toContain('-ms-[10px]');
    expect(button!.textContent).toBe('10');
  });

  it('reads shown of total while channels are hidden', async () => {
    const host = await mount({ selectedChannels: allBut('b') });

    expect(chip(host)!.getAttribute('aria-label')).toBe(
      'Channels: 9 of 10 shown'
    );
    expect(chip(host)!.textContent).toBe('9/10');
  });

  it('is named in Arabic', async () => {
    await i18next.changeLanguage('ar');
    const host = await mount({ selectedChannels: allBut('b') });
    const named = (label: string) =>
      buttons(host).find((b) => b.getAttribute('aria-label') === label);

    expect(named('القنوات الظاهرة: 9 من 10')).toBeDefined();
    expect(named('القنوات الظاهرة: 9 من 10')!.textContent).toBe('9/10');
  });

  it('opens the channel sheet from the chip', async () => {
    const host = await mount();

    await click(chip(host)!);

    expect(mockOpenChannels).toHaveBeenCalledTimes(1);
    expect(chip(host)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('puts Create Post beside the chip, before the date row', async () => {
    const host = await mount();
    const create = host.querySelector(
      '[data-testid="new-post"]'
    )!.parentElement;
    const dateRow = today(host)!.parentElement;

    expect(classes(create)).toEqual(
      expect.arrayContaining(['mobile:order-2', 'mobile:flex-1'])
    );
    expect(classes(dateRow)).toEqual(
      expect.arrayContaining(['mobile:order-3', 'mobile:basis-full'])
    );
    expect(count(host, 'add-provider')).toBe(0);
  });

  it('offers Add Channel in the chip’s place with no channel yet, and no Create Post', async () => {
    const host = await mount({ integrations: [] });
    const add = host.querySelector('[data-testid="add-provider"]');

    expect(chip(host)).toBeUndefined();
    expect(add).not.toBeNull();
    expect(classes(add!.parentElement)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex', 'mobile:order-1'])
    );
    expect(mockAddProvider).toHaveBeenLastCalledWith({ update: mockUpdate });
    expect(count(host, 'new-post')).toBe(0);
  });
});

describe('the second row at 1025px and below', () => {
  it('holds Today, Previous, Next, the short date and the view button, in that order', async () => {
    const host = await mount();
    const row = today(host)!.parentElement!;
    const order = [
      today(host),
      byLabel(host, 'Previous week'),
      byLabel(host, 'Next week'),
      dates(host).short,
      viewButton(host),
    ];

    order.forEach((node) => {
      expect(node).toBeTruthy();
      expect(row.contains(node!)).toBe(true);
    });
    order
      .slice(1)
      .forEach((node, index) =>
        expect(follows(order[index]!, node!)).toBe(true)
      );
  });

  it('names the view button for the view and opens a menu of the four views', async () => {
    const host = await mount();
    const button = viewButton(host)!;

    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toBe('View: Week');
    expect(button.textContent).toBe('Week');
    expect(classes(button)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex', ...FOCUS_RING])
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menuItems(host).map((item) => item.textContent)).toEqual([
      'Day',
      'Week',
      'Month',
      'List',
    ]);

    await click(menuItems(host).find((item) => item.textContent === 'Month')!);

    expect(lastFilters()?.display).toBe('month');
    expect(menuItems(host)).toHaveLength(0);
  });

  it('names the view button in Arabic', async () => {
    await i18next.changeLanguage('ar');
    const host = await mount();

    expect(byLabel(host, 'العرض: أسبوع')?.textContent).toBe('أسبوع');
  });

  it('keeps the view button in the List view, so the list can be left', async () => {
    const host = await mount({ display: 'list' });
    const button = viewButton(host)!;

    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toBe('View: List');

    await click(button);
    await click(menuItems(host).find((item) => item.textContent === 'Week')!);

    expect(lastFilters()?.display).toBe('week');
  });

  it.each([
    ['en', 'Wed, 11 Nov', 'Wednesday, 11 November 2026'],
    ['ar', '11 نوفمبر', 'الأربعاء, 11 نوفمبر 2026'],
  ])(
    'reads short for a day in %s, and in words above 1025px',
    async (lng, short, long) => {
      await i18next.changeLanguage(lng);
      const host = await mount({
        display: 'day',
        startDate: '2026-11-11',
        endDate: '2026-11-11',
      });

      expect(dates(host).short?.textContent).toBe(short);
      expect(dates(host).long?.textContent).toBe(long);
    }
  );

  it.each(['week', 'month'])(
    'reads the same at every width for a %s, cut with an ellipsis',
    async (display) => {
      const host = await mount({ display });
      const { long, short } = dates(host);

      expect(long).toBeDefined();
      expect(short?.textContent).toBe(long?.textContent);
      expect(classes(short!.parentElement)).toContain('mobile:truncate');
    }
  );
});

// One control height at 1025px and below: 44px, with 44px-wide arrows. Each
// list-state segment takes taps across the whole row while its tinted pill
// keeps upstream's look. Above 1025px the 54px rows on touch screens stay.
describe('the 44px rule at 1025px and below', () => {
  it('makes Today, the view button and the arrows 44px tall, and the arrows 44px wide', async () => {
    const host = await mount();
    const [previous, next] = arrows(host);

    expect(previous).toBe(byLabel(host, 'Previous week'));
    expect(next).toBe(byLabel(host, 'Next week'));
    [today(host), previous, next].forEach((control) =>
      expect(classes(control)).toEqual(
        expect.arrayContaining(['mobile:h-[44px]', 'coarse:h-[54px]'])
      )
    );
    expect(classes(viewButton(host))).toContain('h-[44px]');
    [previous, next].forEach((arrow) =>
      expect(classes(arrow)).toEqual(
        expect.arrayContaining(['mobile:w-[44px]', 'coarse:min-w-[44px]'])
      )
    );
    expect(classes(viewButtons(host)[0].parentElement)).toContain(
      'coarse:min-h-[54px]'
    );
  });

  it('makes the list states and the pager 44px tall, and the pager arrows 44px wide', async () => {
    const host = await mount({ display: 'list', listTotalPages: 3 });
    const states = segment(host, 'Scheduled').target!.parentElement!;
    const [previous, next] = arrows(host);
    const pager = previous.parentElement!;

    expect(classes(states)).toEqual(
      expect.arrayContaining([
        'mobile:h-[44px]',
        'mobile:min-h-[44px]',
        'coarse:min-h-[54px]',
      ])
    );
    expect(classes(pager)).toEqual(
      expect.arrayContaining(['mobile:h-[44px]', 'coarse:h-[54px]'])
    );
    [previous, next].forEach((arrow) =>
      expect(classes(arrow)).toEqual(
        expect.arrayContaining(['mobile:w-[44px]', 'coarse:min-w-[44px]'])
      )
    );
  });

  it('takes a list state’s tap across the full row, with the fill on its pill', async () => {
    const host = await mount({ display: 'list' });
    const { pill, target } = segment(host, 'All');

    expect(classes(target)).toContain('mobile:h-full');
    expect(classes(target)).not.toContain('bg-brandSoft');
    expect(classes(pill)).toEqual(
      expect.arrayContaining(['text-brandText', 'bg-brandSoft'])
    );
  });
});

describe('the List view', () => {
  it('shows the list states and the pager in place of the date controls', async () => {
    const host = await mount({ display: 'list', listTotalPages: 3 });

    expect(today(host)).toBeUndefined();
    expect(byLabel(host, 'Previous week')).toBeNull();
    expect(byText(host, 'Page 1 of 3')).toBeDefined();
    ['All', 'Scheduled', 'Draft', 'Published'].forEach((label) =>
      expect(segment(host, label).pill).toBeDefined()
    );

    await click(segment(host, 'Scheduled').target!);
    expect(mockSetListState).toHaveBeenCalledWith('scheduled');

    await click(arrows(host)[1]);
    expect(mockSetListPage).toHaveBeenCalledWith(1);
  });
});
