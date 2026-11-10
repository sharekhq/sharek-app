import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Onboarding's "Your brand" step (spec 053, US7, FR-030; boards OnboardBrand
// and OnboardBrandPhone; research R16): a second step of four, right after
// Connect Channels. A brand name, the website lookup with the Brands page's
// own suggestions (no fonts, research R15), and the offer to put the
// organization's channels in the brand, ticked. Skip creates nothing;
// Continue sends POST /brands, then the kept suggestions to
// PUT /brands/:id/kit/from-website, then moves on. A taken name, or a logo
// that couldn't be saved, keeps the step and says why.
//
// t() is the real i18next on the en and ar files, so a counted phrase renders
// the form each language picks and the Arabic step reads the canvas's words.

const request = jest.fn();
const reloadBrands = jest.fn();
const reloadChannels = jest.fn();
// undefined while GET /brands is still loading
let brands:
  | Array<{ id: string; name: string; kit?: { colours: string[] } }>
  | undefined = [];
let channels: Array<{
  id: string;
  name: string;
  identifier: string;
  picture: string;
  customer: { id: string; name: string } | null;
}> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
// GET /brands and the channel list, by their SWR keys: what the step counts
// and what it reloads after a change. Every other list is empty.
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) =>
    key === '/brands'
      ? { data: brands, mutate: reloadBrands }
      : key === '/integrations/list'
      ? { data: channels, mutate: reloadChannels }
      : { data: undefined },
  useSWRConfig: () => ({ mutate: jest.fn() }),
}));
// The modal's other steps pull the MCP page in; its contexts and the
// clipboard shim are shells, as in onboarding.direction.spec.
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ publicApi: 'KEY', tier: { public_api: true } }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled: true, backendUrl: '', mcpUrl: '' }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: jest.fn(), openModal: jest.fn() }),
  useDecisionModal: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/developer/developer.component', () => ({
  DeveloperComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/public-api/mcp.client.icons', () => ({
  McpClientIcon: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({ AddProviderComponent: () => null })
);
// The channel list's focus ring; its module has its own spec.
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  FOCUS_RING: 'focus-visible:ring-2 focus-visible:ring-brand',
}));
jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import i18next from 'i18next';
import { OnboardingModal } from '@gitroom/frontend/components/onboarding/onboarding.modal';

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

const channel = (id: string) => ({
  id,
  name: `Rawda ${id}`,
  identifier: 'instagram',
  picture: `https://cdn/${id}.png`,
  customer: null,
});

// What POST /brands/website finds on rawda.sa, as the Brands page's spec has
// it: the logos, best first, and the first one's colours.
const SITE = {
  foundOn: 'rawda.sa',
  logos: [
    'https://rawda.sa/logo.svg',
    'https://rawda.sa/favicon.png',
    'https://cdn.rawda.sa/og.jpg',
  ],
  colours: ['#0E7C86', '#F2B84B', '#E6F4F5'],
};

const answer = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// Each route's answer, which a case can change; anything else is a request
// the step should not send.
let answers: Record<string, () => unknown>;

beforeEach(() => {
  brands = [];
  channels = [channel('c1'), channel('c2'), channel('c3')];
  answers = {
    '/brands': () => answer({ id: 'new1' }),
    '/brands/website': () => answer(SITE),
    '/brands/website/colours': () => answer({ colours: ['#1D2B36'] }),
    '/brands/new1/kit/from-website': () =>
      answer({ id: 'new1', name: 'Rawda Florist', kit: {} }),
  };
  request.mockImplementation(async (url: string) => {
    if (!answers[url]) {
      throw new Error(`Unexpected request to ${url}`);
    }
    return answers[url]();
  });
});

const mounted: Root[] = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<OnboardingModal onClose={() => undefined} />);
  });
  return host;
};

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
});

const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  );

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const type = async (input: HTMLInputElement, text: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// The field a <label> names.
const labelled = (text: string) => {
  const label = Array.from(document.querySelectorAll('label')).find(
    (node) => node.textContent === text
  );
  return label
    ? (document.getElementById(label.htmlFor) as HTMLInputElement | null)
    : null;
};

const nameField = () => labelled('Brand name')!;
const websiteField = () => labelled('Your website')!;

// The rail: each step's label (hidden on a phone) and its dot.
const stepLabels = () =>
  Array.from(document.querySelectorAll('span'))
    .filter((node) => node.className.split(/\s+/).includes('phone:hidden'))
    .map((node) => node.textContent);
const dots = () =>
  Array.from(document.querySelectorAll('div')).filter((node) => {
    const classes = node.className.split(/\s+/);
    return classes.includes('w-[32px]') && classes.includes('h-[32px]');
  });
const current = () =>
  dots().findIndex((node) => node.getAttribute('aria-current') === 'step') + 1;

// The element whose own text is exactly this.
const textNode = (text: string) =>
  Array.from(document.querySelectorAll('body *')).find(
    (node) => node.textContent === text && !node.children.length
  );

const TITLE = 'Set up your brand';
const BODY =
  "Samy and Sharek's AI use its logo and look to keep your images on-brand. Add more brands later from Brands.";
const AGENTS = 'Connect Your AI Agent';

// The offer to move the channels: a checkbox among the colour toggles, told
// apart by its words.
const offer = () =>
  Array.from(document.querySelectorAll('[role="checkbox"]')).find((node) =>
    node.textContent?.includes('in this brand')
  );

const logos = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button[aria-pressed]'));
const colours = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[role="checkbox"][title]')
  );
const picked = () =>
  logos()
    .filter((node) => node.getAttribute('aria-pressed') === 'true')
    .map((node) => node.querySelector('img')?.getAttribute('src'));
const ticked = () =>
  colours()
    .filter((node) => node.getAttribute('aria-checked') === 'true')
    .map((node) => node.getAttribute('aria-label'));

// The requests sent, in order, and the bodies sent to one route.
const calls = () =>
  request.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
const sent = (url: string) =>
  request.mock.calls
    .filter(([called]) => called === url)
    .map(([, init]) => ({ method: init.method, body: JSON.parse(init.body) }));

// From Connect Channels, whose Continue reads "Continue" once a channel is
// connected, to the brand step.
const toBrandStep = async () => {
  await mount();
  await click(button('Continue'));
};

const lookUp = async (address = 'rawda.sa') => {
  await type(websiteField(), address);
  await click(button('Look up'));
};

const classesOf = (node: Element) =>
  (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// A class on a physical side, which stays put when Arabic flips the page.
const physical = (name: string) =>
  /^(?:[^:]+:)*-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)(?:-|$)/.test(
    name
  );

describe('onboarding has four steps, "Your brand" second', () => {
  it('lists Your brand right after Connect Channels, before Connect Agents and Watch Tutorial', async () => {
    await mount();

    expect(stepLabels()).toEqual([
      'Connect Channels',
      'Your brand',
      'Connect Agents',
      'Watch Tutorial',
    ]);
    expect(dots().map((node) => node.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(current()).toBe(1);
  });

  it('opens on Continue from Connect Channels, with its heading and a line that names Samy and no tool', async () => {
    await toBrandStep();

    expect(current()).toBe(2);
    expect(textNode(TITLE)).toBeDefined();
    const line = textNode(TITLE)!.nextElementSibling;
    expect(line?.textContent).toBe(BODY);
    expect(line?.textContent).toContain('Samy');
    expect(line?.textContent).not.toMatch(/tool|studio|MCP|CLI/i);
  });

  it('keeps each dot round on a rail too narrow for four labels, which wrap instead', async () => {
    await mount();

    for (const node of dots()) {
      expect(classesOf(node)).toContain('shrink-0');
    }
  });
});

describe('the brand step', () => {
  it('asks for the brand name and the website, each labelled, the address left to right, with Look up', async () => {
    await toBrandStep();

    expect(nameField()).toBeTruthy();
    expect(nameField().value).toBe('');
    expect(nameField().maxLength).toBe(60);
    // an empty field keeps the interface's direction
    expect(nameField().hasAttribute('dir')).toBe(false);
    await type(nameField(), 'روضة');
    expect(nameField().getAttribute('dir')).toBe('auto');

    expect(websiteField()).toBeTruthy();
    expect(websiteField().getAttribute('dir')).toBe('ltr');
    expect(button('Look up')!.hasAttribute('disabled')).toBe(true);
    // the card's own actions stay on the Brands page
    expect(button('Add to kit')).toBeUndefined();
    expect(button('Not now')).toBeUndefined();
  });

  it('looks the website up with the Brands page suggestions: where they were found, the logos with the first picked, the colours ticked, and no fonts', async () => {
    await toBrandStep();

    await lookUp();

    expect(sent('/brands/website')).toEqual([
      { method: 'POST', body: { url: 'rawda.sa' } },
    ]);
    expect(document.body.textContent).toContain('Found on ⁨rawda.sa⁩');
    expect(document.body.textContent).toContain('Pick a logo');
    expect(
      logos().map((node) => node.querySelector('img')?.getAttribute('src'))
    ).toEqual(SITE.logos);
    expect(picked()).toEqual([SITE.logos[0]]);
    expect(ticked()).toEqual(SITE.colours);
    expect(document.body.textContent).not.toMatch(/font/i);
    // a lookup creates and saves nothing
    expect(calls()).toEqual(['POST /brands/website']);
  });

  it('ticks every colour the site suggests, as a new brand has room for all six, and says nothing about room', async () => {
    const six = [...SITE.colours, '#1D2B36', '#FFFFFF', '#C0392B'];
    answers['/brands/website'] = () => answer({ ...SITE, colours: six });
    await toBrandStep();

    await lookUp();

    expect(ticked()).toEqual(six);
    expect(document.body.textContent).not.toMatch(/room for|colours are full/);
  });

  it("offers to put the organization's channels in the brand, ticked and counted", async () => {
    await toBrandStep();

    expect(offer()!.textContent).toContain('Put my 3 channels in this brand');
    expect(offer()!.textContent).toContain(
      'You can move them later from Brands.'
    );
    expect(offer()!.getAttribute('aria-checked')).toBe('true');

    await click(offer());
    expect(offer()!.getAttribute('aria-checked')).toBe('false');
  });

  it('counts one channel as one', async () => {
    channels = [channel('c1')];
    await toBrandStep();

    expect(offer()!.textContent).toContain('Put my 1 channel in this brand');
    expect(offer()!.textContent).toContain(
      'You can move it later from Brands.'
    );
  });

  it('offers nothing to move with no channel connected', async () => {
    channels = [];
    await mount();
    await click(button('Continue without channels'));

    expect(textNode(TITLE)).toBeDefined();
    expect(offer()).toBeUndefined();
  });

  it('offers nothing to move while the brands are still loading, so an organization with brands never sees the offer come and go', async () => {
    brands = undefined;
    await toBrandStep();

    expect(textNode(TITLE)).toBeDefined();
    expect(offer()).toBeUndefined();
  });

  it('offers nothing to move once the organization has a brand, as the server then leaves the channels where they are', async () => {
    brands = [{ id: 'b0', name: 'Bayt Al Qahwa' }];
    await toBrandStep();

    expect(textNode(TITLE)).toBeDefined();
    expect(offer()).toBeUndefined();
  });
});

describe('Skip', () => {
  it('moves on to Connect Agents and creates nothing, whatever was typed or found', async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await lookUp();

    await click(button('Skip'));

    expect(current()).toBe(3);
    expect(textNode(AGENTS)).toBeDefined();
    expect(calls()).toEqual(['POST /brands/website']);
    expect(reloadBrands).not.toHaveBeenCalled();
    expect(reloadChannels).not.toHaveBeenCalled();
  });
});

describe('Continue', () => {
  it('is off until the brand has a name', async () => {
    await toBrandStep();

    expect(button('Continue')!.hasAttribute('disabled')).toBe(true);
    await type(nameField(), '   ');
    expect(button('Continue')!.hasAttribute('disabled')).toBe(true);
    await type(nameField(), 'Rawda Florist');
    expect(button('Continue')!.hasAttribute('disabled')).toBe(false);
  });

  it('creates the brand with the channels moved into it, reloads the brands and the channels, and moves on', async () => {
    await toBrandStep();
    await type(nameField(), '  Rawda Florist ');

    await click(button('Continue'));

    expect(sent('/brands')).toEqual([
      { method: 'POST', body: { name: 'Rawda Florist', moveUngrouped: true } },
    ]);
    // nothing was looked up, so no kit
    expect(calls()).toEqual(['POST /brands']);
    expect(reloadBrands).toHaveBeenCalled();
    expect(reloadChannels).toHaveBeenCalled();
    expect(current()).toBe(3);
    expect(textNode(AGENTS)).toBeDefined();
  });

  it('leaves the channels where they are with the offer unticked', async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await click(offer());

    await click(button('Continue'));

    expect(sent('/brands')).toEqual([
      { method: 'POST', body: { name: 'Rawda Florist', moveUngrouped: false } },
    ]);
    expect(current()).toBe(3);
  });

  it('moves no channel when the organization already has a brand', async () => {
    brands = [{ id: 'b0', name: 'Bayt Al Qahwa' }];
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');

    await click(button('Continue'));

    expect(sent('/brands')).toEqual([
      { method: 'POST', body: { name: 'Rawda Florist', moveUngrouped: false } },
    ]);
  });

  it('creates the brand, then saves the suggestions kept to its kit, then moves on', async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await lookUp();
    await click(colours()[1]);

    await click(button('Continue'));

    expect(calls()).toEqual([
      'POST /brands/website',
      'POST /brands',
      'PUT /brands/new1/kit/from-website',
    ]);
    expect(sent('/brands/new1/kit/from-website')).toEqual([
      {
        method: 'PUT',
        body: { logo: SITE.logos[0], colours: ['#0E7C86', '#E6F4F5'] },
      },
    ]);
    expect(reloadBrands).toHaveBeenCalled();
    expect(current()).toBe(3);
  });

  it('saves no kit when nothing found was kept', async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await lookUp();
    await click(logos()[0]);
    for (const node of colours()) {
      await click(node);
    }

    await click(button('Continue'));

    expect(calls()).toEqual(['POST /brands/website', 'POST /brands']);
    expect(current()).toBe(3);
  });

  it('says the name is taken and stays, saving nothing', async () => {
    answers['/brands'] = () =>
      answer({ message: ['A brand with this name already exists'] }, 400);
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await lookUp();

    await click(button('Continue'));

    const alert = Array.from(document.querySelectorAll('[role="alert"]')).map(
      (node) => node.textContent
    );
    expect(alert).toEqual(['A brand with this name already exists.']);
    expect(current()).toBe(2);
    expect(textNode(TITLE)).toBeDefined();
    expect(calls()).toEqual(['POST /brands/website', 'POST /brands']);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it("says when the logo couldn't be saved and stays; Continue again saves to the brand it created, not a second one", async () => {
    answers['/brands/new1/kit/from-website'] = () => answer({}, 422);
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await lookUp();

    await click(button('Continue'));

    expect(document.body.textContent).toContain(
      "This logo couldn't be saved, so nothing was added. Pick another logo or try again."
    );
    expect(current()).toBe(2);
    // the brand exists now, under the name it was created with
    expect(nameField().readOnly).toBe(true);

    answers['/brands/new1/kit/from-website'] = () =>
      answer({ id: 'new1', name: 'Rawda Florist', kit: {} });
    await click(logos()[1]);
    await click(button('Continue'));

    expect(sent('/brands')).toHaveLength(1);
    expect(sent('/brands/new1/kit/from-website')).toEqual([
      {
        method: 'PUT',
        body: { logo: SITE.logos[0], colours: SITE.colours },
      },
      {
        method: 'PUT',
        body: { logo: SITE.logos[1], colours: ['#1D2B36'] },
      },
    ]);
    expect(current()).toBe(3);
  });
});

describe('Back', () => {
  it('returns to Connect Channels', async () => {
    await toBrandStep();
    expect(textNode(TITLE)).toBeDefined();

    await click(button('Back'));

    expect(current()).toBe(1);
    expect(textNode('Connect Your Channels')).toBeDefined();
    expect(calls()).toEqual([]);
  });
});

// Each step change unmounts the step left, so what the step has done must
// outlive it: the name typed, and the brand Continue created.
describe('coming back to the step', () => {
  it('shows the brand Continue created, read-only, and Continue again saves the suggestions to it rather than creating it again', async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await click(button('Continue'));
    expect(current()).toBe(3);

    await click(button('Back'));

    expect(current()).toBe(2);
    expect(nameField().value).toBe('Rawda Florist');
    expect(nameField().readOnly).toBe(true);

    await lookUp();
    await click(button('Continue'));

    expect(sent('/brands')).toHaveLength(1);
    expect(sent('/brands/new1/kit/from-website')).toEqual([
      { method: 'PUT', body: { logo: SITE.logos[0], colours: SITE.colours } },
    ]);
    expect(document.body.textContent).not.toContain(
      'A brand with this name already exists.'
    );
    expect(current()).toBe(3);
  });

  it("ticks only the colours the created brand's kit still has room for", async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await click(button('Continue'));
    // the reloaded list holds the new brand, its kit's colours since filled
    brands = [
      {
        id: 'new1',
        name: 'Rawda Florist',
        kit: {
          colours: ['#111111', '#222222', '#333333', '#444444', '#555555'],
        },
      },
    ];

    await click(button('Back'));
    await lookUp();

    expect(ticked()).toEqual([SITE.colours[0]]);
    expect(document.body.textContent).toContain(
      'Your kit has room for 1 more colour.'
    );
  });

  it('keeps the name typed, still editable, when the step is skipped and come back to', async () => {
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await click(button('Skip'));

    await click(button('Back'));

    expect(current()).toBe(2);
    expect(nameField().value).toBe('Rawda Florist');
    expect(nameField().readOnly).toBe(false);
    expect(calls()).toEqual([]);
  });
});

describe('the step mirrors and fits a finger', () => {
  it('uses logical sides only, rings each control on focus and gives a finger 44px', async () => {
    await toBrandStep();
    await lookUp();

    for (const node of Array.from(document.querySelectorAll('body *'))) {
      expect(classesOf(node).filter(physical)).toEqual([]);
    }
    for (const node of [
      nameField(),
      websiteField(),
      offer()!,
      button('Back')!,
      button('Skip')!,
      button('Continue')!,
    ]) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    }
    expect(classesOf(nameField())).toContain('coarse:h-[44px]');
  });

  it("draws Back, Skip and Continue as the modal's other steps do, each taller than 44px by its padding", async () => {
    await toBrandStep();

    // Back and Skip bordered, Back with its arrow
    for (const node of [button('Back')!, button('Skip')!]) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining([
          'border-2',
          'border-boxFocused',
          'rounded-[12px]',
          'py-[12px]',
        ])
      );
    }
    expect(button('Back')!.querySelector('svg')).not.toBeNull();
    // Continue the large brand button with its arrow
    expect(classesOf(button('Continue')!)).toEqual(
      expect.arrayContaining(['bg-brand', 'rounded-[12px]', 'py-[14px]'])
    );
    expect(button('Continue')!.querySelector('svg')).not.toBeNull();
  });

  it('keeps Skip once the brand is created', async () => {
    answers['/brands/new1/kit/from-website'] = () => answer({}, 422);
    await toBrandStep();
    await type(nameField(), 'Rawda Florist');
    await lookUp();
    await click(button('Continue'));
    expect(nameField().readOnly).toBe(true);

    await click(button('Skip'));

    expect(current()).toBe(3);
  });

  it('reads in Arabic, the address kept left to right', async () => {
    await i18next.changeLanguage('ar');
    await mount();
    await click(button('متابعة'));

    expect(stepLabels()).toEqual([
      'ربط القنوات',
      'علامتك التجارية',
      'ربط الوكلاء',
      'مشاهدة الدليل',
    ]);
    expect(current()).toBe(2);
    expect(textNode('جهز علامتك التجارية')).toBeDefined();
    expect(document.body.textContent).toContain(
      'يستخدم سامي والذكاء الاصطناعي في شارك شعارها ومظهرها لتبقى صورك متسقة مع علامتك.'
    );
    expect(labelled('اسم العلامة التجارية')).toBeTruthy();
    expect(labelled('موقعك')!.getAttribute('dir')).toBe('ltr');
    expect(button('ابحث')).toBeDefined();
    // the only checkbox before a lookup
    const move = Array.from(document.querySelectorAll('[role="checkbox"]'))[0];
    expect(move.textContent).toContain('ضع قنواتي الـ3 في هذه العلامة');
    expect(move.textContent).toContain(
      'يمكنك نقلها لاحقًا من صفحة العلامات التجارية.'
    );
    expect(button('رجوع')).toBeDefined();
    expect(button('تخطي')).toBeDefined();
    expect(button('متابعة')).toBeDefined();
  });
});
