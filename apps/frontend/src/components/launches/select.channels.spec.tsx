import { act, ComponentProps, FC, useState } from 'react';
import { createRoot } from 'react-dom/client';

// The calendar's channel filter came from upstream. As merged, its list
// always hung from the trigger's left edge, so in Arabic it opened away from
// the trigger; its border was upstream's purple; the trigger was a div no
// keyboard could reach; a filtered calendar showed itself by border colour
// alone; and a second untick re-ticked the first channel, because the shared
// Checkbox kept the click handler of its first render. Its list mode, the
// checklist in the calendar's Select Channels sheet at 1025px and below, came
// with spec 046.
type Channel = {
  id: string;
  name: string;
  picture: string;
  identifier?: string;
  customer: { id: string } | null;
};
type CalendarDouble = {
  integrations: Channel[];
  customer: string | null;
  selectedChannels: string[] | null;
  setSelectedChannels: (next: string[] | null) => void;
};

// The real hook reads the calendar's context, so the double keeps that shape:
// the harness below holds the selection in state and provides it.
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
// the list mode's rows are the composer's channel rows (044), as scenery
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
import { SelectChannels } from '@gitroom/frontend/components/launches/select.channels';

const channel = (id: string, customer: string | null = null): Channel => ({
  id,
  name: `channel ${id}`,
  picture: '',
  customer: customer ? { id: customer } : null,
});

// Every selection the filter hands the calendar, in order.
const picks: Array<string[] | null> = [];

const Harness: FC<{
  integrations: Channel[];
  customer: string | null;
  list?: boolean;
}> = ({ integrations, customer, list }) => {
  const [selectedChannels, setSelectedChannels] = useState<string[] | null>(
    null
  );
  const calendar: CalendarDouble = {
    integrations,
    customer,
    selectedChannels,
    setSelectedChannels: (next) => {
      picks.push(next);
      setSelectedChannels(next);
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
      <SelectChannels list={list} />
    </CalendarContext.Provider>
  );
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async (
  integrations: Channel[] = ['a', 'b', 'c'].map((id) => channel(id)),
  customer: string | null = null,
  list?: boolean
) => {
  picks.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <Harness integrations={integrations} customer={customer} list={list} />
    );
  });
  // happy-dom has no layout: the trigger is placed 600px in, 42px square.
  const anchor = host.firstElementChild;
  if (anchor) {
    jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      x: 600,
      y: 10,
      width: 42,
      height: 42,
    } as DOMRect);
  }
  return host;
};

const trigger = (host: HTMLElement) =>
  host.querySelector('[data-tooltip-id="tooltip"]') as HTMLElement;
const list = (host: HTMLElement) => host.querySelector('.fixed') as HTMLElement;
// Not a [class*="w-[24px]"] selector: happy-dom's parser trips on the nested
// brackets. The first box is "Select all".
const boxes = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).filter((d) =>
    d.className.includes('w-[24px]')
  );

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Every case runs in a window 1000px wide.
const innerWidth = window.innerWidth;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1000,
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  document.dir = 'ltr';
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: innerWidth,
  });
});

describe('the channel filter', () => {
  it('hangs its list from the trigger’s left edge in English', async () => {
    const host = await mount();

    await click(trigger(host));

    expect(list(host).style.left).toBe('600px');
    expect(list(host).style.right).toBe('');
  });

  it('hangs its list from the trigger’s right edge in Arabic', async () => {
    document.dir = 'rtl';
    const host = await mount();

    await click(trigger(host));

    // 1000 - (600 + 42): the list's right edge meets the trigger's.
    expect(list(host).style.right).toBe('358px');
    expect(list(host).style.left).toBe('');
  });

  it('keeps the list on screen when the trigger sits near the start edge in Arabic', async () => {
    document.dir = 'rtl';
    const host = await mount();
    jest
      .spyOn(host.firstElementChild!, 'getBoundingClientRect')
      .mockReturnValue({ x: 10, y: 10, width: 42, height: 42 } as DOMRect);

    await click(trigger(host));

    // 948px from the right would push a 250px list off the left of a 1000px
    // window; it is clamped like the left case.
    expect(list(host).style.right).toBe('730px');
  });

  it('draws its border in the brand colour while open or filtered', async () => {
    const host = await mount();
    expect(trigger(host).className).toContain('border-newColColor');

    await click(trigger(host));
    expect(trigger(host).className).toContain('border-brand');

    await click(boxes(host)[1]);
    await click(trigger(host));
    expect(list(host)).toBeNull();
    expect(trigger(host).className).toContain('border-brand');
    // The brand token carries the colour; no hard-coded hex is left on it.
    expect(
      trigger(host)
        .className.split(' ')
        .filter((name) => name.startsWith('border-[#'))
    ).toEqual([]);
  });

  it('keeps both channels unticked after two unticks in a row', async () => {
    const host = await mount();
    await click(trigger(host));

    await click(boxes(host)[1]);
    await click(boxes(host)[2]);

    expect(picks).toEqual([['b', 'c'], ['c']]);
  });

  it('is a button a keyboard can reach, named, with its state and a focus ring', async () => {
    const host = await mount();
    const control = trigger(host);

    expect(control.tagName).toBe('BUTTON');
    expect(control.getAttribute('type')).toBe('button');
    expect(control.getAttribute('aria-label')).toBe('Select Channels');
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(control.className.split(' ')).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );

    await click(control);
    expect(trigger(host).getAttribute('aria-expanded')).toBe('true');
  });

  // Colour is never the only sign: a filtered calendar hides posts, and the
  // trigger says so by a mark and by its name.
  it('marks a filtered calendar by more than its colour', async () => {
    const host = await mount();
    const mark = () =>
      trigger(host).querySelector('[aria-hidden="true"].bg-brand');
    expect(mark()).toBeNull();
    expect(trigger(host).getAttribute('data-tooltip-content')).toBe(
      'Select Channels'
    );

    await click(trigger(host));
    await click(boxes(host)[1]);

    expect(mark()).not.toBeNull();
    expect(trigger(host).getAttribute('aria-label')).toBe(
      'Select Channels (filter on)'
    );
    expect(trigger(host).getAttribute('data-tooltip-content')).toBe(
      'Select Channels (filter on)'
    );

    await click(boxes(host)[1]);

    expect(mark()).toBeNull();
    expect(trigger(host).getAttribute('aria-label')).toBe('Select Channels');
  });

  // At 1025px and below the channel sheet (ui/split.panel.tsx, z-[190] over a
  // z-[180] scrim) opens over the toolbar, and a level on the filter's wrapper
  // drew the filter over it and the channel menu in it (walk W53, when the
  // sheet was a side drawer). Only the open list is lifted, as the customer
  // selector's is.
  it('lifts only its open list over the page', async () => {
    const host = await mount();
    const levels = (node: Element) =>
      node.className.split(' ').filter((name) => name.startsWith('z-'));

    expect(levels(host.firstElementChild!)).toEqual([]);

    await click(trigger(host));

    expect(levels(list(host))).toEqual(['z-[500]']);
  });

  it('renders nothing for a single channel', async () => {
    const host = await mount([channel('a')]);

    expect(host.innerHTML).toBe('');
  });

  it('lists only the selected customer’s channels', async () => {
    const host = await mount(
      [channel('a', 'acme'), channel('b', 'acme'), channel('c', 'other')],
      'acme'
    );

    await click(trigger(host));

    expect(list(host).textContent).toContain('channel a');
    expect(list(host).textContent).toContain('channel b');
    expect(list(host).textContent).not.toContain('channel c');
  });
});

// At 1025px and below the filter lives in the calendar's Select Channels
// sheet as a checklist: a heading when there are customers above it, Select
// all, and one row per channel of the current customer.
describe('the channel filter as a list', () => {
  const rows = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="checkbox"]'));
  const selectAll = (host: HTMLElement) =>
    rows(host).find((row) => row.textContent === 'Select all');
  const checked = (host: HTMLElement) =>
    rows(host).map((row) => row.getAttribute('aria-checked'));

  it('lists one row per channel of the current customer', async () => {
    const host = await mount(
      [channel('a', 'acme'), channel('b', 'acme'), channel('c', 'other')],
      'acme',
      true
    );

    expect(host.textContent).toContain('channel a');
    expect(host.textContent).toContain('channel b');
    expect(host.textContent).not.toContain('channel c');
    // no trigger and no dropdown: the sheet is the list's frame
    expect(trigger(host)).toBeNull();
    expect(list(host)).toBeNull();
  });

  it('heads the channels only when there are customers above them', async () => {
    const plain = await mount(undefined, null, true);
    expect(plain.textContent).not.toContain('Channels');

    const grouped = await mount(
      [channel('a', 'acme'), channel('b', 'other')],
      null,
      true
    );
    expect(grouped.textContent).toContain('Channels');
  });

  it('ticks every channel or none from Select all', async () => {
    const host = await mount(undefined, null, true);
    // its label, wherever the row puts it
    const label = () =>
      Array.from(host.querySelectorAll<HTMLElement>('*')).find(
        (el) => el.children.length === 0 && el.textContent === 'Select all'
      );
    expect(label()).toBeDefined();

    await click(label()!);
    expect(picks).toEqual([[]]);

    await click(label()!);
    expect(picks).toEqual([[], null]);
  });

  // A keyboard reaches Select all, and Space or Enter ticks it: a browser
  // turns both keys on a native button into its click, which happy-dom does
  // not emulate, so the click stands in for them here and the keys are walked
  // on a device (W-15).
  it('makes Select all a checkbox button a keyboard can tick', async () => {
    const host = await mount(undefined, null, true);
    const all = selectAll(host);

    expect(all).toBeDefined();
    expect(all!.tagName).toBe('BUTTON');
    expect(all!.getAttribute('type')).toBe('button');
    expect(all!.hasAttribute('disabled')).toBe(false);
    expect(all!.hasAttribute('tabindex')).toBe(false);
    expect(all!.className.split(' ')).toEqual(
      expect.arrayContaining([
        'min-h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(checked(host)).toEqual(['true', 'true', 'true', 'true']);

    await click(all!);
    expect(checked(host)).toEqual(['false', 'false', 'false', 'false']);
    expect(picks).toEqual([[]]);

    await click(selectAll(host)!);
    expect(checked(host)).toEqual(['true', 'true', 'true', 'true']);
    expect(picks).toEqual([[], null]);

    await click(rows(host)[2]);
    expect(selectAll(host)!.getAttribute('aria-checked')).toBe('false');
  });
});
