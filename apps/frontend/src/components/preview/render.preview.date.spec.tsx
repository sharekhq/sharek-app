import { act } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import i18next from 'i18next';
// The public preview at /p/ mounts the app's layout and never the calendar, so
// the layout's dayjs setup is all the page has.
import '@gitroom/frontend/components/layout/html.component';
import { RenderPreviewDate } from '@gitroom/frontend/components/preview/render.preview.date';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

// The singleton, set up with the pair the Arabic locale ships.
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

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  setUserTimezone(null);
  await i18next.changeLanguage('en');
  dayjs.locale('en');
});

describe('the public preview’s date', () => {
  it('prints in the interface language', async () => {
    // The component logs the date it was given.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await i18next.changeLanguage('ar');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <RenderPreviewDate date={new Date(2026, 9, 21, 12, 30).toISOString()} />
      );
    });

    expect(host.textContent).toContain('أكتوبر');
    expect(host.textContent).toMatch(/12:30 م$/);
  });
});

// The public preview does not load the user: it shows the zone this browser
// applied last, and a browser that never applied one shows the viewer's own
// time, as before.
describe('the public preview’s date with a zone applied in this browser', () => {
  const ZONE = 'Asia/Tokyo';

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  it('prints the moment in that zone, in the interface language', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    setUserTimezone(ZONE);
    await i18next.changeLanguage('ar');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      // 03:30 UTC is 12:30 in Tokyo
      root.render(<RenderPreviewDate date="2026-10-21T03:30:00.000Z" />);
    });

    expect(host.textContent).toBe('أكتوبر 21, 2026 12:30 م');
  });
});
