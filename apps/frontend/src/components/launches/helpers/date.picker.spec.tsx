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
// Scenery: the month grid above the time field.
jest.mock('@mantine/dates', () => ({
  ...jest.requireActual('@mantine/dates'),
  Calendar: (): null => null,
}));

import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
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

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
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

    expect(host.firstElementChild!.children[1].textContent).toMatch(/12:30 م$/);
  });
});
