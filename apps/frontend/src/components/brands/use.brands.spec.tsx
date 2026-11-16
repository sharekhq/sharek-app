import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SWRConfig } from 'swr';

// GET /brands as useBrands gives it to the Brands page. A failed answer isn't
// brands: a 500 comes back with a JSON body, an object, which the page would
// take for its list and break on when it sorts it, as /analytics once did on a
// 502 (Sentry 159718423). It's an error SWR asks again for instead.
//
// SWR runs for real on a cache of its own; only the request is stubbed.
//
// useMoveChannels and useRenameBrand are the channel list's and the Brands
// page's changes to a brand (spec 058): a move on PUT /integrations/:id/group
// and a rename on PUT /integrations/customers/:id, each refusal a toast in the
// server's words. The channel list is a spy that records its reloads.
//
// kitStatus and kitNote are what a brand's card on the Brands overview shows
// (spec 059, FR-013): which of the kit's five items are done, and the one
// note the card ends with.

const mockFetch = jest.fn();
const reloadChannels = jest.fn();
const toast = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({ data: [], mutate: reloadChannels }),
  })
);

import {
  Brand,
  kitNote,
  kitStatus,
  useBrands,
  useMoveChannels,
  useRenameBrand,
} from '@gitroom/frontend/components/brands/use.brands';

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

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const render = async (Probe: () => null) => {
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
  await settle();
};

const load = async () => {
  await render(() => {
    const { data, error } = useBrands();
    captured.push({ data, error });
    return null;
  });
  return captured[captured.length - 1];
};

// What a hook answers, from a mounted probe.
const mountHook = async <T,>(useHook: () => T) => {
  const hook = {} as { current: T };
  await render(() => {
    hook.current = useHook();
    return null;
  });
  return hook;
};

const answer = (status: number, body: unknown = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

// The server: a route answers as the case sets it, else 200 (GET /brands an
// empty list).
let routes: Record<string, () => unknown> = {};
const serve = () => {
  routes = {};
  mockFetch.mockImplementation(async (url: string) =>
    url in routes ? routes[url]() : answer(200, [])
  );
};

// The route's answer, held back until the case releases it.
const hold = (url: string, status = 200, body: unknown = {}) => {
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(answer(status, body));
  });
  routes[url] = () => held;
  return async () => {
    await act(async () => {
      release();
    });
    await settle();
  };
};

// The changes sent, as [route, body].
const sent = () =>
  mockFetch.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([url, init]) => [url, init.body]);

// How many times GET /brands was asked.
const brandLoads = () =>
  mockFetch.mock.calls.filter(([url, init]) => url === '/brands' && !init)
    .length;

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

describe('useMoveChannels', () => {
  beforeEach(serve);

  it('sends one PUT /integrations/:id/group per channel with the brand, then reloads the channel list once', async () => {
    const answerA = hold('/integrations/a/group');
    const answerB = hold('/integrations/b/group');
    const move = await mountHook(useMoveChannels);

    let done = false;
    await act(async () => {
      move.current(['a', 'b'], 'brand-1').then(() => {
        done = true;
      });
    });
    await settle();

    expect(sent()).toEqual([
      ['/integrations/a/group', '{"group":"brand-1"}'],
      ['/integrations/b/group', '{"group":"brand-1"}'],
    ]);
    // the list reloads once every move is answered
    expect(reloadChannels).not.toHaveBeenCalled();
    await answerA();
    expect(reloadChannels).not.toHaveBeenCalled();
    await answerB();
    expect(done).toBe(true);
    expect(reloadChannels).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it("moves to No brand with ''", async () => {
    const move = await mountHook(useMoveChannels);

    await act(async () => {
      await move.current(['a'], '');
    });

    expect(sent()).toEqual([['/integrations/a/group', '{"group":""}']]);
    expect(reloadChannels).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'its message',
      { message: 'Integration not found' },
      'Integration not found',
    ],
    [
      'the first of its messages',
      { message: ['group must be a string', 'group should not be empty'] },
      'group must be a string',
    ],
  ])(
    'a refusal toasts %s, and the channel list still reloads, since the others may have moved',
    async (_, body, words) => {
      routes['/integrations/a/group'] = () => answer(400, body);
      const move = await mountHook(useMoveChannels);

      await act(async () => {
        await move.current(['a', 'b'], 'brand-1');
      });

      expect(sent()).toHaveLength(2);
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(words, 'warning');
      expect(reloadChannels).toHaveBeenCalledTimes(1);
    }
  );
});

describe('useRenameBrand', () => {
  beforeEach(serve);

  it('sends the new name to PUT /integrations/customers/:id, then reloads GET /brands and the channel list', async () => {
    const rename = await mountHook(useRenameBrand);
    expect(brandLoads()).toBe(1);

    await act(async () => {
      await rename.current({ id: 'c1' }, 'New');
    });

    expect(sent()).toEqual([['/integrations/customers/c1', '{"name":"New"}']]);
    expect(brandLoads()).toBe(2);
    expect(reloadChannels).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it('settles only once the channel list has reloaded', async () => {
    let reloaded = () => {};
    reloadChannels.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          reloaded = resolve;
        })
    );
    const rename = await mountHook(useRenameBrand);

    let done = false;
    await act(async () => {
      rename.current({ id: 'c1' }, 'New').then(() => {
        done = true;
      });
    });
    await settle();

    expect(brandLoads()).toBe(2);
    expect(reloadChannels).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    await act(async () => {
      reloaded();
    });
    await settle();

    expect(done).toBe(true);
  });

  it('settles only once GET /brands has answered again', async () => {
    const rename = await mountHook(useRenameBrand);
    const answerBrands = hold('/brands', 200, []);

    let done = false;
    await act(async () => {
      rename.current({ id: 'c1' }, 'New').then(() => {
        done = true;
      });
    });
    await settle();

    expect(brandLoads()).toBe(2);
    expect(reloadChannels).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    await answerBrands();

    expect(done).toBe(true);
  });

  it('a refusal toasts the server’s message and reloads nothing', async () => {
    routes['/integrations/customers/c1'] = () =>
      answer(400, { message: 'A group with this name already exists' });
    const rename = await mountHook(useRenameBrand);

    await act(async () => {
      await rename.current({ id: 'c1' }, 'New');
    });

    expect(sent()).toEqual([['/integrations/customers/c1', '{"name":"New"}']]);
    expect(toast).toHaveBeenCalledWith(
      'A group with this name already exists',
      'warning'
    );
    expect(brandLoads()).toBe(1);
    expect(reloadChannels).not.toHaveBeenCalled();
  });
});

// A brand with the kit and details a case gives, the rest empty.
const brand = (
  kit: Partial<Brand['kit']> = {},
  details: Partial<Brand['details']> = {}
): Brand => ({
  id: 'b1',
  name: 'Bayt Al Qahwa',
  kit: {
    logo: null,
    examples: [],
    colours: [],
    headingFont: null,
    bodyFont: null,
    ...kit,
  },
  details: {
    about: null,
    toneOfVoice: null,
    postLanguage: null,
    callToAction: null,
    hashtags: null,
    ...details,
  },
});

// A kit image still in Media, and one deleted from it.
const live = (id: string) => ({
  id,
  path: `https://media/${id}.png`,
  missing: false,
});
const deleted = (id: string) => ({ id, path: null, missing: true });

// Every item of the kit done.
const FULL = brand(
  {
    logo: live('m1'),
    examples: [live('e1'), live('e2'), live('e3')],
    colours: ['#0E7C86', '#F2B84B'],
    headingFont: 'Tajawal',
    bodyFont: 'Cairo',
  },
  { about: 'Specialty coffee roasted in Riyadh.' }
);

describe('kitStatus', () => {
  it('finds nothing in an empty kit', () => {
    expect(kitStatus(brand())).toEqual({
      logo: false,
      colours: false,
      fonts: false,
      examples: 0,
      about: false,
    });
  });

  it('finds every item in a full kit', () => {
    expect(kitStatus(FULL)).toEqual({
      logo: true,
      colours: true,
      fonts: true,
      examples: 3,
      about: true,
    });
  });

  it('counts a logo deleted from Media as missing', () => {
    expect(kitStatus(brand({ logo: deleted('m1') })).logo).toBe(false);
  });

  it('counts a heading font alone as fonts', () => {
    expect(kitStatus(brand({ headingFont: 'Tajawal' })).fonts).toBe(true);
  });

  it('counts a body font alone as fonts', () => {
    expect(kitStatus(brand({ bodyFont: 'Cairo' })).fonts).toBe(true);
  });

  it('counts an About of spaces as missing', () => {
    expect(kitStatus(brand({}, { about: '   ' })).about).toBe(false);
  });

  it('counts only the examples still in Media', () => {
    expect(
      kitStatus(brand({ examples: [live('e1'), deleted('e2')] })).examples
    ).toBe(1);
  });
});

describe('kitNote', () => {
  it('is no_channels for a brand with no channels, even with a full kit', () => {
    expect(kitNote(kitStatus(FULL), 0)).toBe('no_channels');
    expect(kitNote(kitStatus(brand()), 0)).toBe('no_channels');
  });

  it('is empty with channels and no logo, colour or example; fonts and About alone leave it empty', () => {
    expect(kitNote(kitStatus(brand()), 2)).toBe('empty');
    expect(
      kitNote(
        kitStatus(
          brand(
            { headingFont: 'Tajawal', bodyFont: 'Cairo' },
            { about: 'Specialty coffee roasted in Riyadh.' }
          )
        ),
        2
      )
    ).toBe('empty');
  });

  it('counts a logo or an example deleted from Media as missing', () => {
    expect(
      kitNote(
        kitStatus(brand({ logo: deleted('m1'), examples: [deleted('e1')] })),
        2
      )
    ).toBe('empty');
  });

  it('is ready with channels and all five done, one example enough', () => {
    expect(kitNote(kitStatus(FULL), 1)).toBe('ready');
    expect(
      kitNote(
        kitStatus(brand({ ...FULL.kit, examples: [live('e1')] }, FULL.details)),
        1
      )
    ).toBe('ready');
  });

  it('is null for anything between', () => {
    expect(kitNote(kitStatus(brand({ colours: ['#0E7C86'] })), 1)).toBeNull();
    expect(
      kitNote(kitStatus(brand(FULL.kit, { ...FULL.details, about: null })), 1)
    ).toBeNull();
    expect(
      kitNote(
        kitStatus(brand({ ...FULL.kit, logo: deleted('m1') }, FULL.details)),
        1
      )
    ).toBeNull();
  });
});
