import { act, FC } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// The Brands page's dialogs (spec 053, US1 scenarios 2, 3 and 8, FR-004 to
// FR-006; boards BrandsNew and BrandsDelete): New brand, which offers the first
// brand the channels in no brand, ticked, and sends POST /brands; Delete, which
// says what happens to the brand's channels and images and sends
// DELETE /brands/:id; and Rename, which is the calendar's own rename dialog on
// PUT /integrations/customers/:id (C3). After each change both GET /brands and
// the channel list reload.
//
// t() is the real i18next on the en and ar files, so a counted phrase renders
// the plural form each language picks.

const request = jest.fn();
const reloadBrands = jest.fn();
const reloadChannels = jest.fn();
const toast = jest.fn();
let brands: Array<{ id: string; name: string }> = [];
let channels: Array<{
  id: string;
  name: string;
  customer: { id: string; name: string } | null;
}> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
// The page's two lists, which every dialog refreshes after a change.
jest.mock('@gitroom/frontend/components/brands/use.brands', () => ({
  useBrands: () => ({ data: brands, mutate: reloadBrands }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({ data: channels, mutate: reloadChannels }),
  })
);
// The rename dialog lives in the calendar page's module, which imports the
// calendar and its filters, and through them the post composer. They aren't
// rendered here, so they are markers, as launches.component.spec.tsx makes
// them.
jest.mock('@gitroom/frontend/components/launches/filters', () => ({
  Filters: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/calendar', () => ({
  Calendar: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/menu/menu', () => ({
  Menu: () => null,
}));
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => () => undefined,
}));

import i18next from 'i18next';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { useBrandDialogs } from '@gitroom/frontend/components/brands/brand.dialogs';

const mockTranslate = (
  key: string,
  fallback: string,
  options?: Record<string, unknown>
) => i18next.t(key, { defaultValue: fallback, ...options });

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: readLocale('en') },
      ar: { translation: readLocale('ar') },
    },
  });
});

const BAYT = { id: 'b1', name: 'Bayt Al Qahwa' };
const NOOR = { id: 'b2', name: 'Noor Dental' };

// n channels, all in the given brand or in none.
const inBrand = (
  n: number,
  customer: { id: string; name: string } | null,
  prefix = customer?.id ?? 'none'
) =>
  Array.from({ length: n }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `Channel ${index}`,
    customer,
  }));

// What the page holds: the three open-helpers, and a way for afterEach to
// empty the modal manager's module-level store.
let dialogs: ReturnType<typeof useBrandDialogs>;
let closeEveryModal: (() => void) | undefined;
const Page: FC = () => {
  dialogs = useBrandDialogs();
  closeEveryModal = useModals().closeAll;
  return null;
};

const mounted: Root[] = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <ModalManagerInner />
        <Page />
      </>
    );
  });
};

const open = async (run: () => void) => {
  await act(async () => {
    run();
  });
};

const text = () => document.body.textContent ?? '';

const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  );

const click = async (node: Element | null | undefined) => {
  await act(async () => {
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const field = () => document.querySelector('input') as HTMLInputElement;

const offer = () => document.querySelector('[role="checkbox"]');

const type = async (input: HTMLInputElement, value: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// The requests sent to a route, as [method, body].
const sent = (url: string) =>
  request.mock.calls
    .filter(([called]) => called === url)
    .map(([, init]) => [init.method, init.body && JSON.parse(init.body)]);

beforeEach(() => {
  request.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'b9' }),
  });
  brands = [];
  channels = [];
});

afterEach(async () => {
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  await i18next.changeLanguage('en');
  jest.clearAllMocks();
});

describe('New brand', () => {
  it('opens titled New brand, with a Name field that stops at 60 characters', async () => {
    await mount();
    await open(() => dialogs.openNewBrand());

    expect(text()).toContain('New brand');
    expect(text()).toContain('Name');
    expect(field().maxLength).toBe(60);
    expect(button('Cancel')).toBeDefined();
    expect(button('Create brand')).toBeDefined();
  });

  it('keeps the interface’s direction while the name is empty, and the name’s own once typed', async () => {
    await mount();
    await open(() => dialogs.openNewBrand());

    // dir="auto" on an empty field resolves left to right, even in Arabic
    expect(field().hasAttribute('dir')).toBe(false);
    await type(field(), 'بيت القهوة');
    expect(field().getAttribute('dir')).toBe('auto');
  });

  it('with no brand yet, offers to move the channels in no brand into it, ticked, and Create sends the name and the move (scenario 2)', async () => {
    channels = inBrand(10, null);
    const onCreated = jest.fn();
    await mount();
    await open(() => dialogs.openNewBrand(onCreated));

    expect(text()).toContain('Move my 10 channels with no brand into it');
    expect(text()).toContain(
      'Offered with your first brand only. You can move channels out later.'
    );
    expect(offer()!.getAttribute('aria-checked')).toBe('true');

    await type(field(), '  Bayt Al Qahwa ');
    await click(button('Create brand'));

    expect(sent('/brands')).toEqual([
      ['POST', { name: 'Bayt Al Qahwa', moveUngrouped: true }],
    ]);
    expect(onCreated).toHaveBeenCalledWith('b9');
    expect(reloadBrands).toHaveBeenCalled();
    expect(reloadChannels).toHaveBeenCalled();
    expect(button('Create brand')).toBeUndefined();
  });

  it('unticked, creates the brand without moving them', async () => {
    channels = inBrand(10, null);
    await mount();
    await open(() => dialogs.openNewBrand());

    await click(offer());
    expect(offer()!.getAttribute('aria-checked')).toBe('false');

    await type(field(), 'Bayt Al Qahwa');
    await click(button('Create brand'));

    expect(sent('/brands')).toEqual([
      ['POST', { name: 'Bayt Al Qahwa', moveUngrouped: false }],
    ]);
  });

  it.each([
    ['en', 1, 'Move my 1 channel with no brand into it'],
    ['en', 10, 'Move my 10 channels with no brand into it'],
    ['ar', 1, 'انقل إليها القناة التي بلا علامة تجارية'],
    ['ar', 2, 'انقل إليها القناتين اللتين بلا علامة تجارية'],
    ['ar', 3, 'انقل إليها القنوات التي بلا علامة تجارية (3 قنوات)'],
    ['ar', 11, 'انقل إليها القنوات التي بلا علامة تجارية (11 قناة)'],
  ])('in %s, words the offer for a count of %i', async (lng, n, words) => {
    await i18next.changeLanguage(lng);
    channels = inBrand(n, null);
    await mount();
    await open(() => dialogs.openNewBrand());

    expect(offer()!.textContent).toContain(words);
  });

  it('with no channel in no brand, makes no offer', async () => {
    await mount();
    await open(() => dialogs.openNewBrand());

    expect(offer()).toBeNull();
    expect(text()).not.toContain('Move my');

    await type(field(), 'Bayt Al Qahwa');
    await click(button('Create brand'));

    expect(sent('/brands')).toEqual([
      ['POST', { name: 'Bayt Al Qahwa', moveUngrouped: false }],
    ]);
  });

  it('with a brand already, makes no offer, so the new brand starts with no channels (scenario 3)', async () => {
    brands = [BAYT];
    channels = [...inBrand(3, BAYT), ...inBrand(4, null)];
    await mount();
    await open(() => dialogs.openNewBrand());

    expect(offer()).toBeNull();
    expect(text()).not.toContain('Move my');

    await type(field(), 'Noor Dental');
    await click(button('Create brand'));

    expect(sent('/brands')).toEqual([
      ['POST', { name: 'Noor Dental', moveUngrouped: false }],
    ]);
  });

  it('creates nothing while the name is blank', async () => {
    await mount();
    await open(() => dialogs.openNewBrand());

    expect(button('Create brand')!.disabled).toBe(true);
    await type(field(), '   ');
    expect(button('Create brand')!.disabled).toBe(true);
    await type(field(), 'B');
    expect(button('Create brand')!.disabled).toBe(false);
  });

  it.each([
    ['en', 'A brand with this name already exists.'],
    ['ar', 'توجد علامة تجارية بهذا الاسم بالفعل.'],
  ])(
    'in %s, a name already taken shows its own translated message and keeps the dialog open',
    async (lng, words) => {
      await i18next.changeLanguage(lng);
      request.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'A brand with this name already exists',
        }),
      });
      const onCreated = jest.fn();
      await mount();
      await open(() => dialogs.openNewBrand(onCreated));

      await type(field(), 'Bayt Al Qahwa');
      await click(button(i18next.t('brands_create_brand')));

      expect(toast).toHaveBeenCalledWith(words, 'warning');
      expect(field()).not.toBeNull();
      expect(onCreated).not.toHaveBeenCalled();
      expect(reloadBrands).not.toHaveBeenCalled();
    }
  );

  it('another failure says the brand could not be saved, not that the name is taken', async () => {
    request.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await mount();
    await open(() => dialogs.openNewBrand());

    await type(field(), 'Bayt Al Qahwa');
    await click(button('Create brand'));

    expect(toast).toHaveBeenCalledWith(
      i18next.t('could_not_save_group'),
      'warning'
    );
    expect(field()).not.toBeNull();
  });

  it('Cancel closes it and sends nothing', async () => {
    await mount();
    await open(() => dialogs.openNewBrand());

    await click(button('Cancel'));

    expect(request).not.toHaveBeenCalled();
    expect(field()).toBeNull();
  });
});

describe('Delete', () => {
  it('asks "Delete {name}?" with what happens to its channels and images, and Delete brand sends DELETE /brands/:id (scenario 8)', async () => {
    brands = [BAYT, NOOR];
    channels = [...inBrand(3, BAYT), ...inBrand(2, NOOR), ...inBrand(1, null)];
    await mount();
    await open(() => dialogs.openDeleteBrand(BAYT));

    // the name isolated in its own direction, as a <bdi> would
    expect(text()).toContain('Delete ⁨Bayt Al Qahwa⁩?');
    expect(text()).toContain(
      'Its 3 channels stay connected and move to No brand. The logo and example posts stay in your Media library.'
    );
    expect(button('Cancel')).toBeDefined();

    await click(button('Delete brand'));

    expect(sent('/brands/b1')).toEqual([['DELETE', undefined]]);
    expect(reloadBrands).toHaveBeenCalled();
    expect(reloadChannels).toHaveBeenCalled();
    expect(button('Delete brand')).toBeUndefined();
  });

  it.each([
    ['en', 0, 'The logo and example posts stay in your Media library.'],
    [
      'en',
      1,
      'Its channel stays connected and moves to No brand. The logo and example posts stay in your Media library.',
    ],
    [
      'ar',
      2,
      'تبقى قناتاها متصلتين وتنتقلان إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
    ],
    [
      'ar',
      3,
      'تبقى قنواتها الـ3 متصلة وتنتقل إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
    ],
  ])(
    'in %s, words the sentence for a brand whose count is %i',
    async (lng, n, words) => {
      await i18next.changeLanguage(lng);
      brands = [BAYT];
      channels = [...inBrand(n, BAYT), ...inBrand(2, null)];
      await mount();
      await open(() => dialogs.openDeleteBrand(BAYT));

      expect(text()).toContain(words);
    }
  );

  it('shows the name as typed', async () => {
    const salt = { id: 'b3', name: 'Salt & Sugar' };
    brands = [salt];
    await mount();
    await open(() => dialogs.openDeleteBrand(salt));

    expect(text()).toContain('Delete ⁨Salt & Sugar⁩?');
  });

  it('Cancel keeps the brand', async () => {
    brands = [BAYT];
    await mount();
    await open(() => dialogs.openDeleteBrand(BAYT));

    await click(button('Cancel'));

    expect(request).not.toHaveBeenCalled();
    expect(button('Delete brand')).toBeUndefined();
  });
});

describe('Rename', () => {
  it('is the calendar’s rename dialog, which saves through PUT /integrations/customers/:id, then both lists reload (C3)', async () => {
    brands = [BAYT];
    await mount();
    await open(() => dialogs.openRenameBrand(BAYT));

    expect(text()).toContain(i18next.t('edit_group_name'));
    expect(field().value).toBe('Bayt Al Qahwa');

    await type(field(), 'Bayt Al Qahwa Riyadh');
    await click(button('Save'));

    expect(sent('/integrations/customers/b1')).toEqual([
      ['PUT', { name: 'Bayt Al Qahwa Riyadh' }],
    ]);
    expect(reloadBrands).toHaveBeenCalled();
    expect(reloadChannels).toHaveBeenCalled();
    expect(button('Save')).toBeUndefined();
  });
});
