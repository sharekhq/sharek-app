import { act } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import i18next from 'i18next';
// The public preview at /p/ mounts the app's layout and never the calendar, so
// the layout's dayjs setup is all the page has.
import '@gitroom/frontend/components/layout/html.component';
import { RenderPreviewDate } from '@gitroom/frontend/components/preview/render.preview.date';

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
