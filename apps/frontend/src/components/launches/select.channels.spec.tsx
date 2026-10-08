import { act, ComponentProps, FC, useState } from 'react';
import { createRoot } from 'react-dom/client';

// The calendar's channel filter came with upstream's CAL-2. As merged, its list
// always hung from the trigger's left edge, so in Arabic it opened away from
// the trigger; its border was upstream's purple; the trigger was a div no
// keyboard could reach; a filtered calendar showed itself by border colour
// alone; and a second untick re-ticked the first channel, because the shared
// Checkbox kept the click handler of its first render.
type Channel = {
  id: string;
  name: string;
  picture: string;
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
  const { createContext, useContext } = require('react');
  const CalendarContext = createContext(undefined);
  return {
    CalendarContext,
    useCalendar: () => useContext(CalendarContext),
  };
});
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

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

const Harness: FC<{ integrations: Channel[]; customer: string | null }> = ({
  integrations,
  customer,
}) => {
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
      <SelectChannels />
    </CalendarContext.Provider>
  );
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async (
  integrations: Channel[] = ['a', 'b', 'c'].map((id) => channel(id)),
  customer: string | null = null
) => {
  picks.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<Harness integrations={integrations} customer={customer} />);
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
