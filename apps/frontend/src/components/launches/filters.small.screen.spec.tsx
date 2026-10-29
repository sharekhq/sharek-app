import { act, ComponentProps, FC, ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';

// The calendar's filter bar at 1025px and below (phones and iPads held
// upright) is upstream's: Day, Week, Month and List in one switcher with a
// filter button beside it, then the date stepper and Today, every control 44px
// tall. The customer and channel pickers leave the bar for a "Select Channels"
// bottom sheet. Above 1025px the bar is today's: the pickers inline, the
// calendar and list icons, and the 54px rows on touch screens.
//
// jsdom-like DOMs apply no media queries, so the width rules are pinned by the
// classes that carry them (the emitted CSS is read by tools/tailwind-emit).
type Customer = { id: string; name: string };
type Channel = {
  id: string;
  name: string;
  picture: string;
  identifier: string;
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
  useT: () => (_key: string, fallback: string) => fallback,
}));
const mockToast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
// 044's sheet is scenery here: its title, what it holds and its main button.
jest.mock('@gitroom/frontend/components/ui/bottom.sheet.component', () => ({
  BottomSheet: ({
    title,
    children,
    button,
  }: {
    title: string;
    children: ReactNode;
    button?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="sheet">
      <div data-testid="sheet-title">{title}</div>
      {children}
      {button && (
        <button type="button" onClick={button.onClick}>
          {button.label}
        </button>
      )}
    </div>
  ),
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => ({}) })
);

import { CalendarContext } from '@gitroom/frontend/components/launches/calendar.context';
import { Filters } from '@gitroom/frontend/components/launches/filters';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';

// The window, as the media query reports it: 1025px or narrower unless a case
// grows it, telling the listeners as a browser does (044's phone spec).
const realMatchMedia = window.matchMedia;
let smallWindow = true;
const mediaListeners = new Set<() => void>();
const resize = async (small: boolean) => {
  smallWindow = small;
  await act(async () => {
    mediaListeners.forEach((listener) => listener());
  });
};

const ACME: Customer = { id: 'c1', name: 'Acme' };
const OTHER: Customer = { id: 'c2', name: 'Other' };
const channel = (id: string, customer: Customer | null = null): Channel => ({
  id,
  name: `channel ${id}`,
  picture: '',
  identifier: 'x',
  customer,
});
const FIVE = [
  channel('a', ACME),
  channel('b', ACME),
  channel('c', ACME),
  channel('d', OTHER),
  channel('e', OTHER),
];

const mockSetFilters = jest.fn();
// Every channel selection the filters hand the calendar, in order.
const picks: Array<string[] | null> = [];

type Start = {
  display?: string;
  startDate?: string;
  endDate?: string;
  customer?: string | null;
  integrations?: Channel[];
  selectedChannels?: string[] | null;
  listTotalPages?: number;
};

// The calendar's context, holding the channel selection in state as the real
// provider does; everything else is fixed for the mount.
const Harness: FC<{ start: Start }> = ({ start }) => {
  const [selectedChannels, setSelectedChannels] = useState<string[] | null>(
    start.selectedChannels ?? null
  );
  const [customer, setCustomer] = useState<string | null>(
    start.customer ?? null
  );
  const calendar = {
    // a week in the past, so no view button is already on its own range
    display: 'week',
    startDate: '2020-01-06',
    endDate: '2020-01-12',
    integrations: FIVE,
    listPage: 0,
    listTotalPages: 1,
    listState: 'all',
    setListState: jest.fn(),
    setListPage: jest.fn(),
    ...start,
    customer,
    selectedChannels,
    setSelectedChannels: (next: string[] | null) => {
      picks.push(next);
      setSelectedChannels(next);
    },
    setFilters: (filters: { customer: string | null }) => {
      mockSetFilters(filters);
      setCustomer(filters.customer);
    },
  };
  return (
    <CalendarContext.Provider
      value={
        calendar as unknown as ComponentProps<
          typeof CalendarContext.Provider
        >['value']
      }
    >
      <Filters />
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
// A view or state segment: the label, and the element that takes its tap.
const segment = (host: HTMLElement, label: string) => {
  const pill = byText(host, label);
  return { pill, target: pill?.parentElement };
};
// The filter button that opens the sheet; the inline channel filter above
// 1025px shares its name, but not its small-screen reveal.
const filterButton = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button')).find(
    (b) =>
      (b.getAttribute('aria-label') ?? '').startsWith('Select Channels') &&
      classes(b).includes('mobile:flex')
  );
const sheet = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('[data-testid="sheet"]');
// The date and pager arrows are drawn by these two paths.
const arrows = (host: HTMLElement) =>
  Array.from(
    host.querySelectorAll(
      'path[d="M6.5 11L1.5 6L6.5 1"], path[d="M1.5 11L6.5 6L1.5 1"]'
    )
  ).map((path) => path.closest('svg')!.parentElement as HTMLElement);
// The calendar and list icon pair beside the switcher above 1025px.
const iconPair = (host: HTMLElement) =>
  host.querySelector('path[d^="M15.75 7.41667"]')?.closest('svg')?.parentElement
    ?.parentElement as HTMLElement | undefined;
const lastFilters = () =>
  mockSetFilters.mock.calls[mockSetFilters.mock.calls.length - 1]?.[0];

beforeEach(() => {
  mockSetFilters.mockClear();
  mockToast.mockClear();
  picks.length = 0;
  smallWindow = true;
  mediaListeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      mediaListeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
});

describe('the view switcher at 1025px and below', () => {
  it.each([
    ['Day', 'day'],
    ['Week', 'week'],
    ['Month', 'month'],
    ['List', 'list'],
  ])('offers %s, which opens that view', async (label, view) => {
    const host = await mount();
    const { pill } = segment(host, label);
    expect(pill).toBeDefined();

    await click(pill!);

    expect(lastFilters()?.display).toBe(view);
  });

  it('shows List in the switcher only below 1025px, and the icon pair only above', async () => {
    const host = await mount();

    expect(classes(segment(host, 'List').target)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );
    expect(iconPair(host)).toBeDefined();
    expect(classes(iconPair(host))).toContain('mobile:hidden');
  });

  it('opens the week grid from the calendar icon in the list view', async () => {
    const host = await mount({ display: 'list' });
    const calendarIcon = host
      .querySelector('path[d^="M15.75 7.41667"]')!
      .closest('svg')!.parentElement!;

    await click(calendarIcon);

    expect(lastFilters()?.display).toBe('week');
  });
});

describe('the date at 1025px and below', () => {
  it('reads short for a day, and long above 1025px', async () => {
    const host = await mount({
      display: 'day',
      startDate: '2026-10-28',
      endDate: '2026-10-28',
    });
    const spans = Array.from(host.querySelectorAll('span'));
    const long = spans.find((s) => s.className === 'mobile:hidden');
    const short = spans.find((s) => s.className === 'hidden mobile:inline');

    expect(long?.textContent).toMatch(/^Wednesday \(/);
    expect(short?.textContent).toMatch(/^Wed \(/);
    expect(short?.textContent).not.toMatch(/^Wednesday/);
  });

  it.each(['week', 'month'])(
    'reads the same at every width for a %s',
    async (display) => {
      const host = await mount({ display });
      const spans = Array.from(host.querySelectorAll('span'));
      const long = spans.find((s) => s.className === 'mobile:hidden');
      const short = spans.find((s) => s.className === 'hidden mobile:inline');

      expect(long).toBeDefined();
      expect(short?.textContent).toBe(long?.textContent);
    }
  );
});

// One control height at 1025px and below: 44px, with 44px-wide arrows. Each
// segment takes taps across the whole row while its tinted pill keeps
// upstream's look. Above 1025px the 54px rows on touch screens stay.
describe('the 44px rule at 1025px and below', () => {
  it('makes the switcher, the date box and Today 44px tall, and the arrows 44px wide', async () => {
    const host = await mount();
    const switcher = segment(host, 'Week').target!.parentElement!;
    const [previous, next] = arrows(host);
    const dateBox = previous.parentElement!;
    const today = byText(host, 'Today')!.parentElement!;

    expect(classes(switcher)).toEqual(
      expect.arrayContaining([
        'mobile:h-[44px]',
        'mobile:min-h-[44px]',
        'coarse:min-h-[54px]',
      ])
    );
    expect(classes(dateBox)).toEqual(
      expect.arrayContaining(['mobile:h-[44px]', 'coarse:h-[54px]'])
    );
    expect(classes(today)).toEqual(
      expect.arrayContaining(['mobile:h-[44px]', 'coarse:h-[54px]'])
    );
    [previous, next].forEach((arrow) =>
      expect(classes(arrow)).toEqual(
        expect.arrayContaining(['mobile:w-[44px]', 'coarse:min-w-[44px]'])
      )
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

  it.each([
    [{}, 'Week'],
    [{ display: 'list' }, 'All'],
  ])(
    'takes a segment’s tap across the full row, with the fill on its pill (%p)',
    async (start, label) => {
      const host = await mount(start);
      const { pill, target } = segment(host, label);

      expect(classes(target)).toContain('mobile:h-full');
      expect(classes(target)).not.toContain('bg-brandSoft');
      expect(classes(pill)).toEqual(
        expect.arrayContaining(['text-brandText', 'bg-brandSoft'])
      );
    }
  );
});

describe('the filter button at 1025px and below', () => {
  it('is not shown for a single channel', async () => {
    const host = await mount({ integrations: [channel('a')] });

    expect(filterButton(host)).toBeUndefined();
  });

  it('is a named button with its state and a focus ring', async () => {
    const host = await mount();
    const button = filterButton(host);

    expect(button).toBeDefined();
    expect(button!.getAttribute('type')).toBe('button');
    expect(button!.getAttribute('aria-label')).toBe('Select Channels');
    expect(button!.getAttribute('aria-expanded')).toBe('false');
    expect(classes(button)).toEqual(
      expect.arrayContaining([
        'hidden',
        'mobile:flex',
        'w-[44px]',
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('says the filter is on, in the brand colour with a dot', async () => {
    const host = await mount({ selectedChannels: ['a', 'b'] });
    const button = filterButton(host);

    expect(button).toBeDefined();
    expect(button!.getAttribute('aria-label')).toBe(
      'Select Channels (filter on)'
    );
    expect(classes(button)).toEqual(
      expect.arrayContaining(['border-brand', 'text-brandText'])
    );
    expect(button!.querySelector('.bg-brand')).not.toBeNull();
    expect(host.innerHTML).not.toMatch(/#612BD3/i);
  });
});

describe('the Select Channels sheet', () => {
  const open = async (start: Start = {}) => {
    const host = await mount(start);
    expect(filterButton(host)).toBeDefined();
    await click(filterButton(host)!);
    return host;
  };
  const radios = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'));
  const row = (host: HTMLElement, name: string) =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="checkbox"]')).find(
      (el) => el.textContent === name
    );

  it('opens titled Select Channels, with the customers above the channels', async () => {
    const host = await open();

    expect(sheet(host)).not.toBeNull();
    expect(filterButton(host)!.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="sheet-title"]')!.textContent).toBe(
      'Select Channels'
    );
    const text = sheet(host)!.textContent!;
    expect(text.indexOf('Acme')).toBeGreaterThan(-1);
    expect(text.indexOf('Acme')).toBeLessThan(text.indexOf('channel a'));
    expect(radios(host).map((r) => r.textContent)).toEqual(['Acme', 'Other']);
    FIVE.forEach(({ name }) => expect(row(host, name)).toBeDefined());
  });

  it('picks a customer as the inline selector does, with its toast', async () => {
    const host = await open();

    await click(radios(host)[1]);

    expect(lastFilters()?.customer).toBe('c2');
    expect(mockToast).toHaveBeenCalledWith(
      'Customer socials selected',
      'success'
    );
  });

  it('unticks a channel, and Select all brings every channel back', async () => {
    const host = await open();

    await click(row(host, 'channel b')!);
    expect(picks).toEqual([['a', 'c', 'd', 'e']]);

    await click(byText(host, 'Select all')!);
    expect(picks[picks.length - 1]).toBeNull();
  });

  it('closes on Done, and the filters stay', async () => {
    const host = await open();
    await click(row(host, 'channel b')!);

    await click(byText(host, 'Done')!);

    expect(sheet(host)).toBeNull();
    expect(filterButton(host)!.getAttribute('aria-label')).toBe(
      'Select Channels (filter on)'
    );
  });

  it('marks the picked customer in the brand colour', async () => {
    const host = await open({ customer: 'c1' });
    const circle = (radio: HTMLElement) =>
      radio.lastElementChild as HTMLElement;
    const [acme, other] = radios(host);

    expect(classes(circle(acme))).toContain('border-brand');
    expect(classes(circle(acme).firstElementChild)).toContain('bg-brand');
    expect(classes(circle(other))).toContain('border-line');
    expect(circle(other).firstElementChild).toBeNull();
    expect(sheet(host)!.innerHTML).not.toMatch(/#FC69FF|\/20\b/i);
  });

  // A keyboard reaches each customer, and Space or Enter picks one: a browser
  // turns both keys on a native button into its click, which happy-dom does
  // not emulate, so the click stands in for them here and the keys are walked
  // on a device (W-15).
  it('makes each customer a radio button a keyboard can pick', async () => {
    const host = await open({ customer: 'c1' });
    const group = host.querySelector('[role="radiogroup"]');

    expect(group).not.toBeNull();
    expect(group!.getAttribute('aria-label')).toBe('Customers');
    expect(radios(host).every((r) => group!.contains(r))).toBe(true);
    radios(host).forEach((radio) => {
      expect(radio.tagName).toBe('BUTTON');
      expect(radio.getAttribute('type')).toBe('button');
      expect(radio.hasAttribute('disabled')).toBe(false);
      expect(radio.hasAttribute('tabindex')).toBe(false);
      expect(classes(radio)).toEqual(
        expect.arrayContaining([
          'min-h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
    expect(radios(host).map((r) => r.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
    ]);

    await click(radios(host)[1]);

    expect(radios(host).map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
    ]);
    expect(lastFilters()?.customer).toBe('c2');
    expect(mockToast).toHaveBeenCalledWith(
      'Customer socials selected',
      'success'
    );
  });
});

describe('the Select Channels sheet and the wide layout', () => {
  const open = async (start: Start = {}) => {
    const host = await mount(start);
    expect(filterButton(host)).toBeDefined();
    await click(filterButton(host)!);
    return host;
  };
  // The inline customer selector above 1025px, always in the page.
  const inlineCustomer = (host: HTMLElement) =>
    host.querySelector<HTMLElement>(
      '[data-tooltip-content="Select Customer"]'
    )!;

  // An iPad turned to landscape (820 to 1180) with the sheet open.
  it('closes when the window grows past 1025px', async () => {
    const host = await open();
    expect(sheet(host)).not.toBeNull();

    await resize(false);

    expect(sheet(host)).toBeNull();
    expect(filterButton(host)!.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the customer picked in the sheet on the inline selector too', async () => {
    const host = await open({ customer: 'c1' });
    expect(inlineCustomer(host).textContent).toContain('Acme');

    await click(
      Array.from(host.querySelectorAll('[role="radio"]')).find(
        (radio) => radio.textContent === 'Other'
      )!
    );
    await click(byText(host, 'Done')!);
    await resize(false);

    expect(inlineCustomer(host).textContent).toContain('Other');
  });
});
