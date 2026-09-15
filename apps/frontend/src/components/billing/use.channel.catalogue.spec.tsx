import { act } from 'react';
import { createRoot } from 'react-dom/client';

// SWR is the seam: the hook's job is what it asks for and what it derives, and
// every state the strip has to survive is a different thing coming back.
const swrCalls: Array<{ key: unknown; fetcher: (path: string) => unknown }> = [];
let mockResult: any = { data: undefined };

jest.mock('swr', () => ({
  __esModule: true,
  default: (key: unknown, fetcher: (path: string) => unknown) => {
    swrCalls.push({ key, fetcher });
    return mockResult;
  },
}));

let mockResponse: any = { social: [] };
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => () => Promise.resolve({ json: () => Promise.resolve(mockResponse) }),
}));

import {
  SHOWN_CHANNELS,
  useChannelCatalogue,
} from '@gitroom/frontend/components/billing/use.channel.catalogue';

const mounted: Array<{ unmount: () => void }> = [];
const captured: Array<ReturnType<typeof useChannelCatalogue>> = [];

const catalogue = (result: any) => {
  mockResult = result;
  swrCalls.length = 0;
  captured.length = 0;
  const Probe = () => {
    captured.push(useChannelCatalogue());
    return null;
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<Probe />);
  });
  return captured[captured.length - 1];
};

const channels = (n: number) => Array.from({ length: n }, (_, i) => ({ identifier: `p${i}` }));

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockResponse = { social: [] };
});

describe('the channel catalogue', () => {
  // All three candidate literals disagree — the live endpoint answers 32,
  // socialIntegrationList defines 36, and the figure asked for implies 30 — which
  // is the whole reason this is read rather than written down.
  it('counts what the named icons leave out', () => {
    expect(catalogue({ data: channels(32) }).remainder).toBe(
      32 - SHOWN_CHANNELS.length
    );
  });

  it('says nothing rather than +0 when the named icons are the whole catalogue', () => {
    expect(catalogue({ data: channels(SHOWN_CHANNELS.length) }).remainder).toBeNull();
    expect(catalogue({ data: channels(5) }).remainder).toBeNull();
  });

  // The strip is beside a checkout form. A catalogue that is slow, or down,
  // costs the page its remainder and nothing else.
  it('leaves the strip standing when the catalogue never arrives', () => {
    expect(catalogue({ data: undefined }).remainder).toBeNull();
    expect(catalogue({ data: undefined, error: new Error('502') }).remainder).toBeNull();
    expect(catalogue({ data: null }).remainder).toBeNull();
  });

  // Constitution IV — /integrations/list is the organisation's own connected
  // channels and is already fetched under that key elsewhere. This is the
  // catalogue of everything connectable, which is a different question.
  it("asks for the catalogue, not the organisation's own channels", () => {
    catalogue({ data: undefined });

    expect(swrCalls).toHaveLength(1);
    expect(swrCalls[0].key).toBe('/integrations');
  });

  it('reads the catalogue off the shape the endpoint actually answers', async () => {
    catalogue({ data: undefined });
    mockResponse = { social: channels(11) };

    await expect(swrCalls[0].fetcher('/integrations')).resolves.toHaveLength(11);
  });
});
