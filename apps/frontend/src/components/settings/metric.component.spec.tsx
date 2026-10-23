// The timezone select on Sharek's Date Metrics card: the choice is the
// account's, saved through POST /user/timezone (the server validates it with
// @IsTimeZone), applied by reloading the page, and a failure keeps the old
// choice with a translated warning.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const request = jest.fn();
const toast = jest.fn();
let mockUser: { timezoneName: string | null } = { timezoneName: null };

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback: string, values?: Record<string, string>) =>
      `${key}:${fallback.replace('{{timezone}}', values?.timezone ?? '')}`,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));

import MetricComponent from '@gitroom/frontend/components/settings/metric.component';
import { browserTimezone } from '@gitroom/frontend/components/layout/set.timezone';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis,
// and isUSCitizen reads it.
globalThis.localStorage = window.localStorage;

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

const zoneSelect = (host: HTMLElement) =>
  host.querySelector<HTMLSelectElement>('select[name="timezone"]')!;

const choose = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

// The reload is observed, not performed.
const location = window.location;
const reload = jest.fn();

beforeEach(() => {
  mockUser = { timezoneName: null };
  request.mockReset().mockResolvedValue({ status: 201 });
  toast.mockReset();
  reload.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload },
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  localStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: location,
  });
});

describe('the timezone setting', () => {
  it('starts on Automatic, naming the browser’s zone, for a user who never chose one', async () => {
    const host = await render(<MetricComponent />);

    expect(zoneSelect(host).value).toBe('');
    expect(zoneSelect(host).options[0].textContent).toBe(
      `automatic_timezone:Automatic (${browserTimezone()})`
    );
    expect(host.textContent).toContain('timezone:Timezone');
  });

  it('shows the zone the account has', async () => {
    mockUser = { timezoneName: 'Asia/Tokyo' };
    const host = await render(<MetricComponent />);

    expect(zoneSelect(host).value).toBe('Asia/Tokyo');
  });

  it('offers only names the browser knows', async () => {
    const host = await render(<MetricComponent />);

    const names = Array.from(zoneSelect(host).options).map((o) => o.value);
    expect(names).toContain('Asia/Riyadh');
    expect(names).not.toContain('Europe/Zaporizhzhia');
  });

  it('saves a chosen zone to the account and reloads the page in it', async () => {
    const host = await render(<MetricComponent />);

    await choose(zoneSelect(host), 'Asia/Tokyo');

    expect(request).toHaveBeenCalledWith('/user/timezone', {
      method: 'POST',
      body: JSON.stringify({ timezoneName: 'Asia/Tokyo' }),
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it('saves Automatic as no zone', async () => {
    mockUser = { timezoneName: 'Asia/Tokyo' };
    const host = await render(<MetricComponent />);

    await choose(zoneSelect(host), '');

    expect(request).toHaveBeenCalledWith('/user/timezone', {
      method: 'POST',
      body: JSON.stringify({ timezoneName: null }),
    });
  });

  it('keeps the old choice and warns, translated, when the server refuses it', async () => {
    request.mockResolvedValue({ status: 400 });
    mockUser = { timezoneName: 'Asia/Tokyo' };
    const host = await render(<MetricComponent />);

    await choose(zoneSelect(host), 'Asia/Riyadh');

    expect(toast).toHaveBeenCalledWith(
      'could_not_save_timezone:Could not save the timezone',
      'warning'
    );
    expect(zoneSelect(host).value).toBe('Asia/Tokyo');
    expect(reload).not.toHaveBeenCalled();
  });

  // Sharek's translated clock setting stays on the card.
  it('keeps the clock setting translated', async () => {
    const host = await render(<MetricComponent />);

    expect(host.textContent).toContain('date_metrics:Date Metrics');
    const clock = host.querySelector<HTMLSelectElement>(
      'select[name="metric"]'
    )!;
    expect(Array.from(clock.options).map((o) => o.textContent)).toEqual([
      'clock_format_12:AM:PM',
      'clock_format_24:24 hours',
    ]);
  });
});
