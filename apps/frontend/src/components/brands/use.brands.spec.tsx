import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SWRConfig } from 'swr';

// GET /brands as useBrands gives it to the Brands page. A failed answer isn't
// brands: a 500 comes back with a JSON body, an object, which the page would
// take for its list and break on when it sorts it, as /analytics once did on a
// 502 (Sentry 159718423). It's an error SWR asks again for instead.
//
// SWR runs for real on a cache of its own; only the request is stubbed.

const mockFetch = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

import { useBrands } from '@gitroom/frontend/components/brands/use.brands';

const mounted: Root[] = [];
// What the hook gave on each render. SWR renders again only for what a render
// reads, so the probe reads data and error as the page does.
const captured: Array<Pick<ReturnType<typeof useBrands>, 'data' | 'error'>> =
  [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  captured.length = 0;
  jest.clearAllMocks();
});

const load = async () => {
  const Probe = () => {
    const { data, error } = useBrands();
    captured.push({ data, error });
    return null;
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Probe />
      </SWRConfig>
    );
  });
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return captured[captured.length - 1];
};

describe('useBrands', () => {
  it('gives the brands GET /brands answers', async () => {
    const brands = [{ id: 'b1', name: 'Bayt Al Qahwa' }];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => brands,
    });

    const result = await load();

    expect(mockFetch).toHaveBeenCalledWith('/brands');
    expect(result.data).toEqual(brands);
    expect(result.error).toBeUndefined();
  });

  it('gives no brands and an error for a 500 with a JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        statusCode: 500,
        message: 'Internal server error',
      }),
    });

    const result = await load();

    expect(mockFetch).toHaveBeenCalledWith('/brands');
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
  });
});
