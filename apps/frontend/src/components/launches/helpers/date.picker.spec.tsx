import { act } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import i18next from 'i18next';

// The composer's date picker: its time field follows the 12- or 24-hour
// setting that the date beside it and the calendar already follow, with the
// two halves of the day named in the interface's language. The field is
// Mantine's own TimeInput, rendered for real.

// The words for the two halves; empty = the English fallbacks.
let words: Record<string, string> = {};
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => words[key] ?? fallback,
}));
// Scenery: the month grid above the time field. It keeps the props it was
// rendered with, for the cases that pick a day as Mantine hands it over.
type CalendarProps = {
  value?: Date;
  month?: Date;
  onChange?: (day: Date) => void;
  dayClassName?: (
    day: Date,
    modifiers: { selected?: boolean; outside?: boolean; weekend?: boolean }
  ) => string;
};
let mockCalendarProps: CalendarProps = {};
jest.mock('@mantine/dates', () => ({
  ...jest.requireActual('@mantine/dates'),
  Calendar: (props: CalendarProps): null => {
    mockCalendarProps = props;
    return null;
  },
}));

import {
  DatePicker,
  DatePickerPanel,
} from '@gitroom/frontend/components/launches/helpers/date.picker';
import {
  browserTimezone,
  newDayjs,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';
// The date beside the time field prints through dayjs, with the word for the
// half of the day that the app's layout sets up.
import 'dayjs/locale/ar';
import '@gitroom/frontend/components/layout/html.component';

// happy-dom has a localStorage; jest.setup.js lifts a fixed list of globals onto
// globalThis and that is not one of them, so isUSCitizen would throw.
globalThis.localStorage = window.localStorage;

// The mocked useT names the time field's halves; dayjs takes its word from the
// singleton, set up with the pair the Arabic locale ships.
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: {} },
      ar: { translation: { am: 'ص', pm: 'م' } },
    },
  });
});

const mounted: Array<{ unmount: () => void }> = [];

const at = dayjs('2026-10-21 21:30');

const open = async (hours: '12' | '24', onChange = jest.fn(), date = at) => {
  localStorage.setItem('isUS', hours === '12' ? 'US' : 'GLOBAL');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<DatePicker date={date} onChange={onChange} />);
  });
  await act(async () => {
    host.firstElementChild!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
  });
  return host;
};

const fields = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('input')).map((input) => input.value);

const step = async (input: HTMLInputElement) => {
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );
  });
};

// the date line beside the calendar icon
const line = (host: HTMLElement) =>
  host.firstElementChild!.children[1].textContent;

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockCalendarProps = {};
  setUserTimezone(null);
  localStorage.clear();
  words = {};
  await i18next.changeLanguage('en');
  dayjs.locale('en');
});

describe('the date picker’s time field', () => {
  it('shows 12-hour time with am and pm when that is the setting', async () => {
    const host = await open('12');

    expect(fields(host)).toEqual(['09', '30', 'pm']);
  });

  it('shows 24-hour time, with no am or pm, when that is the setting', async () => {
    const host = await open('24');

    expect(fields(host)).toEqual(['21', '30']);
  });

  it('moves the time to the other half of the same day', async () => {
    const onChange = jest.fn();
    const host = await open('12', onChange);

    await step(host.querySelectorAll('input')[2]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].format('YYYY-MM-DD HH:mm')).toBe(
      '2026-10-21 09:30'
    );
  });

  it('names the halves in Arabic and still moves between them', async () => {
    words = { am: 'ص', pm: 'م' };
    const onChange = jest.fn();
    const host = await open('12', onChange);

    expect(fields(host)).toEqual(['09', '30', 'م']);

    await step(host.querySelectorAll('input')[2]);

    expect(onChange.mock.calls[0][0].format('YYYY-MM-DD HH:mm')).toBe(
      '2026-10-21 09:30'
    );
  });

  // Right to left, the row would read 30 : 09 م, minutes first, unlike the
  // date line it sets.
  it('keeps the hour before the minutes in Arabic', async () => {
    words = { am: 'ص', pm: 'م' };
    const host = await open('12');
    const [hour, minute, half] = Array.from(host.querySelectorAll('input'));
    const row = hour.closest('div')!;

    expect(row.contains(minute) && row.contains(half)).toBe(true);
    expect(Array.from(row.classList)).toContain('[direction:ltr]');
  });
});

describe('the date picker’s date', () => {
  it('names half past noon as afternoon in Arabic', async () => {
    await i18next.changeLanguage('ar');
    dayjs.locale('ar');

    const host = await open(
      '12',
      jest.fn(),
      dayjs(new Date(2026, 9, 21, 12, 30))
    );

    expect(line(host)).toMatch(/12:30 م$/);
  });
});

// The account's timezone reaches Sharek's own picker: Mantine works in
// the machine's local dates, so the picker hands it the zone's wall clock
// (toPickerDate) and reads what comes back as a wall clock (plain dayjs), then
// places it in the zone (newDayjs). The gate runs this file under the
// machine's zone, TZ=UTC and TZ=America/New_York (run-tz-matrix.sh).
describe('the date picker with a zone chosen', () => {
  // ahead of every machine the gate uses, no daylight saving
  const AHEAD = 'Asia/Tokyo';
  // behind every machine the gate uses, no daylight saving: a picked day read
  // through the zone would land on the day before
  const BEHIND = 'Pacific/Honolulu';

  it('runs on a machine outside both zones', () => {
    expect([AHEAD, BEHIND]).not.toContain(browserTimezone());
  });

  it("shows the zone's time in the field and on the date line", async () => {
    setUserTimezone(AHEAD);
    const host = await open('12', jest.fn(), newDayjs('2026-10-21 21:30:00'));

    expect(fields(host)).toEqual(['09', '30', 'pm']);
    expect(line(host)).toBe('10/21/2026 09:30 PM');
  });

  it('saves the moment the field shows when only the half changes', async () => {
    setUserTimezone(AHEAD);
    const onChange = jest.fn();
    const host = await open('12', onChange, newDayjs('2026-10-21 21:30:00'));

    await step(host.querySelectorAll('input')[2]);

    // 09:30 in Tokyo
    expect(onChange.mock.calls[0][0].utc().format()).toBe(
      '2026-10-21T00:30:00Z'
    );
  });

  it('saves the moment the field shows when only the minutes change', async () => {
    setUserTimezone(AHEAD);
    const onChange = jest.fn();
    const host = await open('24', onChange, newDayjs('2026-10-21 21:30:00'));

    await step(host.querySelectorAll('input')[1]);

    // 21:31 in Tokyo
    expect(onChange.mock.calls[0][0].utc().format()).toBe(
      '2026-10-21T12:31:00Z'
    );
  });

  it('keeps the picked day and the time in the zone', async () => {
    setUserTimezone(BEHIND);
    const onChange = jest.fn();
    await open('24', onChange, newDayjs('2026-10-21 21:30:00'));

    // the month grid shows the zone's day and time as a machine-local date...
    const { value, onChange: pick } = mockCalendarProps;
    expect([value!.getDate(), value!.getHours(), value!.getMinutes()]).toEqual([
      21, 21, 30,
    ]);
    // ...and hands back a machine-local midnight, as Mantine does
    await act(async () => pick!(new Date(2026, 9, 25)));

    // 25 October at 21:30 in Honolulu
    expect(onChange.mock.calls[0][0].utc().format()).toBe(
      '2026-10-26T07:30:00Z'
    );
  });

  it('names half past noon in the zone as afternoon in Arabic', async () => {
    setUserTimezone(AHEAD);
    await i18next.changeLanguage('ar');
    dayjs.locale('ar');

    const host = await open('12', jest.fn(), newDayjs('2026-10-21 12:30:00'));

    expect(line(host)).toMatch(/12:30 م$/);
  });
});

// The date sheet at 1025px and below (spec 044, US3): a month grid, and the
// time typed or stepped, in the date the sheet was opened with. Nothing reaches
// the post until the sheet's Save (manage.modal.phone.spec.tsx).
describe('the date sheet', () => {
  const sheet = async (hours: '12' | '24', onChange = jest.fn(), date = at) => {
    localStorage.setItem('isUS', hours === '12' ? 'US' : 'GLOBAL');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <DatePickerPanel date={date} onChange={onChange} sheet={true} />
      );
    });
    return host;
  };

  const button = (host: HTMLElement, name: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

  const click = async (node: Element) => {
    await act(async () => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  // React reads focus and blur from focusin and focusout, which bubble.
  const focus = async (
    input: HTMLInputElement,
    name: 'focusin' | 'focusout'
  ) => {
    const { FocusEvent: DomFocusEvent } = window as unknown as {
      FocusEvent: typeof FocusEvent;
    };
    await act(async () => {
      input.dispatchEvent(new DomFocusEvent(name, { bubbles: true }));
    });
  };

  const type = async (input: HTMLInputElement, text: string) => {
    await focus(input, 'focusin');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        'value'
      )!.set!;
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await focus(input, 'focusout');
  };

  const changedTo = (onChange: jest.Mock) =>
    onChange.mock.calls.at(-1)[0].format('YYYY-MM-DD HH:mm');

  // The selected pair is the current menu item's: the soft tint in light, a
  // pomegranate tile with white in dark. Nothing here is the rose brandText.
  it('puts the chosen day on the selected tile and rings today, never in rose', async () => {
    await sheet('24');
    const { dayClassName } = mockCalendarProps;
    const chosen = dayClassName!(new Date(2026, 9, 21), { selected: true });
    const today = dayClassName!(new Date(), {});

    expect(chosen.split(' ')).toEqual(
      expect.arrayContaining(['!bg-selectedBg', '!text-selectedText'])
    );
    expect(today.split(' ')).toEqual(
      expect.arrayContaining(['!ring-1', '!ring-inset', '!ring-selectedRing'])
    );
    expect(`${chosen} ${today}`).not.toMatch(/brandText|brandSoft2/);
    expect(dayClassName!(new Date(2026, 9, 1), { outside: true })).toEqual(
      expect.stringContaining('!text-muted')
    );
  });

  it('draws 44px days', async () => {
    await sheet('24');

    expect(
      mockCalendarProps.dayClassName!(new Date(2026, 9, 21), {}).split(' ')
    ).toEqual(expect.arrayContaining(['!h-[44px]', '!leading-[44px]']));
  });

  it('steps the month with two named 44px buttons, mirrored right to left', async () => {
    const host = await sheet('24');

    for (const name of ['Previous month', 'Next month']) {
      const arrow = button(host, name);
      expect(arrow.getAttribute('type')).toBe('button');
      expect(arrow.className.split(' ')).toEqual(
        expect.arrayContaining([
          'w-[44px]',
          'h-[44px]',
          'focus-visible:ring-brand',
        ])
      );
      expect(arrow.querySelector('svg')!.getAttribute('class')).toContain(
        'rtl:rotate-180'
      );
    }
    await click(button(host, 'Next month'));

    expect(dayjs(mockCalendarProps.month).format('YYYY-MM')).toBe('2026-11');
  });

  it('wraps the hours and the minutes past the ends of their range', async () => {
    const onChange = jest.fn();
    const host = await sheet('24', onChange, dayjs('2026-10-21 23:59'));

    await click(button(host, 'Increase hours'));
    expect(changedTo(onChange)).toBe('2026-10-21 00:59');

    await click(button(host, 'Increase minutes'));
    expect(changedTo(onChange)).toBe('2026-10-21 23:00');

    await click(button(host, 'Decrease minutes'));
    expect(changedTo(onChange)).toBe('2026-10-21 23:58');
  });

  it('names each stepper and makes it a 44px button', async () => {
    const host = await sheet('24');

    for (const name of [
      'Increase hours',
      'Decrease hours',
      'Increase minutes',
      'Decrease minutes',
    ]) {
      expect(button(host, name).className.split(' ')).toEqual(
        expect.arrayContaining(['w-[44px]', 'h-[44px]'])
      );
    }
  });

  // 044 T071 F-2: under 16px, iOS Safari zooms the page when a field takes
  // the focus and leaves it zoomed.
  it('types the hours and the minutes at 16px on a touch screen, 14px with a mouse', async () => {
    const host = await sheet('24');
    const fields = Array.from(host.querySelectorAll('input'));

    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.className.split(' ')).toEqual(
        expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
      );
    }
  });

  it('keeps a typed time inside its range', async () => {
    const onChange = jest.fn();
    const host = await sheet('24', onChange);
    const [hours, minutes] = Array.from(host.querySelectorAll('input'));

    await type(hours, '99');
    expect(changedTo(onChange)).toBe('2026-10-21 23:30');

    await type(minutes, '75');
    expect(changedTo(onChange)).toBe('2026-10-21 21:59');
  });

  it('names the two halves of the day in the interface language and moves between them', async () => {
    words = { am: 'ص', pm: 'م' };
    const onChange = jest.fn();
    const host = await sheet('12', onChange);
    const halves = Array.from(host.querySelectorAll('button')).filter((node) =>
      node.hasAttribute('aria-pressed')
    );

    expect(halves.map((half) => half.textContent)).toEqual(['ص', 'م']);
    expect(halves.map((half) => half.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ]);
    expect(halves[1].className.split(' ')).toEqual(
      expect.arrayContaining(['bg-selectedBg', 'text-selectedText'])
    );
    await click(halves[0]);

    expect(changedTo(onChange)).toBe('2026-10-21 09:30');
  });

  it("keeps the time in the account's zone", async () => {
    setUserTimezone('Asia/Tokyo');
    const onChange = jest.fn();
    const host = await sheet('24', onChange, newDayjs('2026-10-21 21:30:00'));

    await click(button(host, 'Increase minutes'));

    // 21:31 in Tokyo
    expect(onChange.mock.calls[0][0].utc().format()).toBe(
      '2026-10-21T12:31:00Z'
    );
  });
});

describe('the date picker opening somewhere else', () => {
  it('calls onOpen instead of opening its popover', async () => {
    const onOpen = jest.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <DatePicker date={at} onChange={jest.fn()} onOpen={onOpen} />
      );
    });

    await act(async () => {
      host.firstElementChild!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(host.querySelector('input')).toBeNull();
  });

  // The top bar's date is a control of its own there: a real button, named by
  // the date it shows, saying it opens a dialog.
  it('is a named button that says it opens a dialog', async () => {
    localStorage.setItem('isUS', 'GLOBAL');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <DatePicker date={at} onChange={jest.fn()} onOpen={jest.fn()} />
      );
    });
    const trigger = host.firstElementChild!;

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.textContent).toContain('21 Oct, 21:30');
    expect(trigger.className.split(' ')).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('stays the popover row it was without onOpen', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<DatePicker date={at} onChange={jest.fn()} />);
    });

    expect(host.firstElementChild!.tagName).toBe('DIV');
  });

  it('is 44px tall in the top bar', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<DatePicker date={at} onChange={jest.fn()} />);
    });

    const classes = host.firstElementChild!.className.split(' ');
    expect(classes).toContain('h-[44px]');
    expect(classes.filter((name) => name.startsWith('mobile:h-'))).toEqual([]);
  });
});
