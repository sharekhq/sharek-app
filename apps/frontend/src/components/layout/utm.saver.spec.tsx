// UtmSaver lives in libraries/helpers, but its spec runs here: the helpers
// jest config transforms .ts only, and this config roots on apps/frontend/src.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const track = jest.fn();
const fireEvents = jest.fn();
let search = new URLSearchParams();
let referrer = '';

jest.mock('next/navigation', () => ({
  useSearchParams: () => search,
}));
jest.mock('@gitroom/react/helpers/use.track', () => ({
  useTrack: () => track,
}));
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => fireEvents,
}));

import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import UtmSaver, {
  useAttribution,
  useUtmUrl,
} from '@gitroom/helpers/utils/utm.saver';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis.
globalThis.localStorage = window.localStorage;
Object.defineProperty(document, 'referrer', {
  configurable: true,
  get: () => referrer,
});

// The page URL and what useSearchParams reports always agree in the app.
const arrive = (url: string) => {
  (
    window as unknown as { happyDOM: { setURL: (url: string) => void } }
  ).happyDOM.setURL(url);
  search = new URL(url).searchParams;
};

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

beforeEach(() => {
  localStorage.clear();
  track.mockReset();
  fireEvents.mockReset();
  referrer = '';
  arrive('http://localhost/');
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('UtmSaver', () => {
  it('stores the first arrival as one attribution set', async () => {
    referrer = 'https://sharek.app/';
    arrive('http://localhost/auth?ref=a&utm_source=b');

    await render(<UtmSaver />);

    expect(JSON.parse(localStorage.getItem('attribution')!)).toEqual({
      ref: 'a',
      utm_source: 'b',
      referrer: 'https://sharek.app/',
      landing_url: 'http://localhost/auth',
    });
    expect(localStorage.length).toBe(1);
  });

  it('keeps the first set when the visitor arrives again with other parameters', async () => {
    const first = JSON.stringify({
      ref: 'first',
      landing_url: 'http://localhost/auth',
    });
    localStorage.setItem('attribution', first);
    arrive('http://localhost/auth?ref=second&utm_source=x');

    await render(<UtmSaver />);

    expect(localStorage.getItem('attribution')).toBe(first);
  });

  // The checkout return marks a trial start, not a payment.
  it('reports the checkout return as a trial start and nothing else', async () => {
    arrive('http://localhost/launches?check=cs_1');

    await render(<UtmSaver />);

    expect(track).toHaveBeenCalledWith(TrackEnum.StartTrial);
    expect(fireEvents).not.toHaveBeenCalled();
  });
});

describe('useAttribution', () => {
  const Probe = () => <span>{JSON.stringify(useAttribution())}</span>;

  it('returns the stored set', async () => {
    const set = {
      utm_source: 'b',
      ref: 'a',
      landing_url: 'http://localhost/auth',
    };
    localStorage.setItem('attribution', JSON.stringify(set));

    const host = await render(<Probe />);

    expect(JSON.parse(host.textContent!)).toEqual(set);
  });

  it('returns an empty set before anything is stored', async () => {
    const host = await render(<Probe />);

    expect(host.textContent).toBe('{}');
  });

  // The register form spreads the set into its body, so nothing outside the
  // named keys may come back, whatever the entry holds.
  it('returns only the named keys', async () => {
    localStorage.setItem(
      'attribution',
      JSON.stringify({ utm_source: 'b', email: 'someone@else.com' })
    );

    const host = await render(<Probe />);

    expect(JSON.parse(host.textContent!)).toEqual({ utm_source: 'b' });
  });
});

describe('useUtmUrl', () => {
  const Probe = () => <span>{useUtmUrl()}</span>;

  it('reports the stored campaign source', async () => {
    localStorage.setItem(
      'attribution',
      JSON.stringify({ utm_source: 'b', ref: 'a' })
    );

    const host = await render(<Probe />);

    expect(host.textContent).toBe('b');
  });

  // Browsers from before the attribution set hold the CTA id under the old
  // key, which used to stand in for a missing source.
  it('never reports the CTA id as the source', async () => {
    localStorage.setItem('utm', JSON.stringify('home-hero'));
    localStorage.setItem('attribution', JSON.stringify({ ref: 'home-hero' }));

    const host = await render(<Probe />);

    expect(host.textContent).toBe('');
  });

  it('reads an entry that holds null as an empty set', async () => {
    localStorage.setItem('attribution', 'null');

    const host = await render(<Probe />);

    expect(host.textContent).toBe('');
  });
});
