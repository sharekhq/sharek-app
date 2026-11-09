import { act, ReactNode, useContext, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Samy's brand chip and its note (spec 053, US4, FR-017, FR-023, FR-024 and
// FR-026; contracts/pages-ui.md part 2, states A to F; boards SamyChip,
// ChipStates, ChipStatesAR, SamyPhoneChip and SamyPhoneSheet). The chip
// follows the "Samy will use" pill and shows the brand in use: the one brand
// among the picked channels, the organization's one brand while none is
// picked, Choose a brand while it waits on several, No brand, or N brands when
// the picked channels span brands. It opens the brand list for this message.
// The user's own pick holds until they change it or the picked channels'
// brands change. With images attached and a brand chosen, a note in the box
// says they go in place of the brand's examples and its logo still goes along.
//
// The page runs as the route has it: Agent holds the picked channels and the
// chip's choice, and AgentChat's message box is the real Input, with the pill
// and the chip in its summary row and the attachments above the text. The
// channel list is a marker whose onChange picks channels, AI Image a stub
// whose onChange attaches, and the brands and channels come from stubbed
// hooks. A probe reads the chip's choice from Agent's context, which is what
// Samy is sent (T056). t() is the real i18next on the en and ar files. The
// test DOM has no layout, so the wrap and the shapes are pinned by the
// classes that carry them.

type Brand = ReturnType<typeof brand>;
type Channel = ReturnType<typeof channel>;

const mockSent = jest.fn();
let mockChannels: Channel[] = [];
let mockBrands: Brand[] | undefined;
let mockPanel: { onChange: (ids: string[]) => void } | undefined;
let mockAiImage: { onChange: (media: { id: string; path: string }) => void };

jest.mock('@copilotkit/react-ui', () => ({
  // The chat's own messages, which the note scrolls as the tray does, then
  // the message box Samy's page draws in CopilotChat's Input slot.
  CopilotChat: ({ Input }: { Input: any }) => (
    <>
      <div className="copilotKitMessages" />
      <Input inProgress={false} onSend={mockSent} />
    </>
  ),
  AssistantMessage: () => null,
  useChatContext: () => ({
    icons: { sendIcon: 'send', stopIcon: 'stop', uploadIcon: 'upload' },
    labels: { placeholder: 'Type a message...' },
  }),
}));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: { children: ReactNode }) => children,
  useCopilotAction: () => {},
  useCopilotContext: () => ({ copilotApiConfig: {} }),
  useCopilotReadable: () => {},
  useCopilotChatInternal: () => ({
    messages: [],
    setMessages: () => {},
    isAvailable: true,
    interrupt: undefined,
  }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.chat.header', () => ({
  ...jest.requireActual(
    '@gitroom/frontend/components/agents/agent.chat.header'
  ),
  ChatHeader: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent.chats', () => ({
  ChatsPanel: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/launches/channel.panel'),
  ChannelPanel: (props: { onChange: (ids: string[]) => void }) => {
    mockPanel = props;
    return null;
  },
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({
      isLoading: false,
      data: mockChannels,
      mutate: () => undefined,
    }),
  })
);
jest.mock('@gitroom/frontend/components/brands/use.brands', () => ({
  useBrands: () => ({ data: mockBrands }),
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: {
    onChange: (media: { id: string; path: string }) => void;
    renderTrigger: (open: () => void, loading: boolean) => ReactNode;
  }) => {
    mockAiImage = props;
    return <>{props.renderTrigger(() => undefined, false)}</>;
  },
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    addFile: () => {},
    destroy: () => {},
    on: () => {},
    off: () => {},
    getState: () => ({ currentUploads: {} }),
  }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MAX_UPLOAD_SIZE: 1000,
  mediaLibrarySize: () => '',
  MediaBox: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('@gitroom/react/helpers/video.frame', () => ({
  VideoFrame: () => <video />,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true } }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ messages: [] }) }),
}));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'thread-1' }),
  usePathname: () => '/agents/thread-1',
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));

import i18next from 'i18next';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import {
  Agent,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

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

function brand(
  id: string,
  name: string,
  logo: { id: string; path: string | null; missing: boolean } | null = null
) {
  return {
    id,
    name,
    kit: {
      logo,
      examples: [],
      colours: [],
      headingFont: null,
      bodyFont: null,
    },
  };
}

function channel(
  id: string,
  customer: { id: string; name: string } | null,
  values: Record<string, unknown> = {}
) {
  return {
    id,
    internalId: `internal-${id}`,
    identifier: 'instagram',
    type: 'social',
    name: `Channel ${id}`,
    picture: `/avatar-${id}.png`,
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
    customer,
    additionalSettings: '[]',
    time: [{ time: 120 }],
    ...values,
  };
}

// As GET /brands gives them, A to Z. Bayt Al Qahwa has a logo; the others
// show their initial.
const BQ = brand('bq', 'Bayt Al Qahwa', {
  id: 'm1',
  path: 'https://media/bq.png',
  missing: false,
});
const ND = brand('nd', 'Noor Dental');
const RF = brand('rf', 'Rawda Florist');

// Bayt Al Qahwa's three channels, Noor Dental's one, Rawda Florist's one,
// disabled, so it counts but can't be picked, and one in no brand.
const CHANNELS = [
  channel('ig', { id: 'bq', name: 'Bayt Al Qahwa' }),
  channel('fb', { id: 'bq', name: 'Bayt Al Qahwa' }),
  channel('x', { id: 'bq', name: 'Bayt Al Qahwa' }),
  channel('li', { id: 'nd', name: 'Noor Dental' }),
  channel('pin', { id: 'rf', name: 'Rawda Florist' }, { disabled: true }),
  channel('tt', null),
];

// The window, as the media query reports it: wider than 1025px unless a case
// narrows it, and what listens for it to change.
const realMatchMedia = window.matchMedia;
let smallWindow = false;
const listeners = new Set<() => void>();

// What the chip has chosen, as Samy will be sent it, kept once each render
// commits.
let chosen: string | undefined;
const Probe = () => {
  const { brand: choice } = useContext(PropertiesContext) as {
    brand?: string;
  };
  useEffect(() => {
    chosen = choice;
  });
  return null;
};

const mounted: Root[] = [];

// The page with the chat in it, and a way to render it again, as a refresh
// of the brands does.
const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const render = async () => {
    await act(async () => {
      root.render(
        <Agent>
          <AgentChat />
          <Probe />
        </Agent>
      );
    });
  };
  await render();
  return render;
};

beforeEach(() => {
  mockChannels = CHANNELS;
  mockBrands = [BQ, ND, RF];
  mockPanel = undefined;
  chosen = 'not read';
  smallWindow = false;
  listeners.clear();
  (URL as any).createObjectURL = jest.fn(() => 'blob:x');
  (URL as any).revokeObjectURL = jest.fn();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
});

const box = () => document.querySelector<HTMLElement>('.copilotKitInput')!;
const textarea = () => box().querySelector('textarea')!;
// The summary row heads the box: the pill, then the chip.
const row = () => box().firstElementChild as HTMLElement;
const pill = () =>
  row().querySelector<HTMLElement>('button:not([aria-haspopup])')!;
const chip = () =>
  document.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
// A brand's name on the chip, in its own direction.
const chipName = () => chip()!.querySelector('[dir="auto"]');
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const options = () =>
  Array.from(listbox()!.querySelectorAll<HTMLElement>('[role="option"]'));
const option = (text: string) =>
  options().find((node) => node.textContent?.includes(text));
const note = () => box().querySelector('p');
const classes = (node: Element) =>
  (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// A class on a physical side, which stays put when Arabic flips the page.
const physical = (name: string) =>
  /^(?:[^:]+:)*-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)(?:-|$)/.test(
    name
  );

const pick = async (...ids: string[]) => {
  await act(async () => mockPanel!.onChange(ids));
};
const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
// Opens the chip's list and picks the option that reads `text`.
const choose = async (text: string) => {
  await click(chip());
  await click(option(text));
};
const attach = async (id: string, ext: string) => {
  await act(async () =>
    mockAiImage.onChange({ id, path: `https://media/${id}.${ext}` })
  );
};

describe('where it sits (FR-023, FR-026)', () => {
  it('follows the "Samy will use" pill in the summary row at the head of the box', async () => {
    await mount();
    await pick('ig');

    expect(Array.from(row().children)).toHaveLength(2);
    expect(row().children[0]).toBe(pill());
    expect(pill().textContent).toContain('Samy will use');
    expect(row().children[1].contains(chip())).toBe(true);
    // the box's own inset, above the images and the text
    expect(classes(row())).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'pt-[10px]', 'px-[12px]'])
    );
  });

  // Board SamyPhoneChip: on a phone the pill keeps its words and count and
  // the chip goes under it with the brand's name.
  it('wraps under the pill where both do not fit, as on a phone, and keeps the name', async () => {
    smallWindow = true;
    await mount();
    await pick('ig');

    expect(classes(row())).toEqual(
      expect.arrayContaining(['flex-wrap', 'gap-x-[8px]', 'gap-y-[6px]'])
    );
    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(
      Array.from(chip()!.querySelectorAll('*'))
        .flatMap(classes)
        .filter((name) => /(^|:)hidden$/.test(name))
    ).toEqual([]);
  });

  it('is a 44px target under a coarse pointer, as the pill is, with a focus ring', async () => {
    await mount();
    await pick('ig');

    expect(classes(chip()!)).toEqual(
      expect.arrayContaining([
        'h-[30px]',
        'coarse:h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('shows nothing while the organization has no brands, or they are still loading', async () => {
    mockBrands = [];
    const render = await mount();
    await pick('ig');
    expect(chip()).toBeNull();
    expect(chosen).toBeUndefined();

    mockBrands = undefined;
    await render();
    expect(chip()).toBeNull();
    expect(chosen).toBeUndefined();
  });
});

describe('what it shows (contracts/pages-ui.md part 2)', () => {
  it('A: the one brand among the picked channels, its logo and name, chosen for the user', async () => {
    await mount();
    await pick('ig', 'fb');

    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chip()!.querySelector('img')!.getAttribute('src')).toBe(
      'https://media/bq.png'
    );
    expect(chip()!.getAttribute('aria-label')).toBe(
      'Brand for this message: Bayt Al Qahwa. Change brand'
    );
    expect(chosen).toBe('bq');
  });

  it('A: leaves channels in no brand out of it', async () => {
    await mount();
    await pick('ig', 'tt');

    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chosen).toBe('bq');
  });

  it("A: shows a brand's initial while it has no logo", async () => {
    await mount();
    await pick('li');

    expect(chip()!.querySelector('img')).toBeNull();
    expect(chip()!.textContent).toBe('NNoor Dental');
    expect(chipName()!.textContent).toBe('Noor Dental');
    expect(chosen).toBe('nd');
  });

  it('B: waits with Choose a brand while several brands and no channels are picked', async () => {
    await mount();

    expect(chip()!.textContent).toBe('Choose a brand');
    expect(chip()!.querySelector('img')).toBeNull();
    expect(chipName()).toBeNull();
    expect(chip()!.getAttribute('aria-label')).toBe(
      'Brand for this message: Choose a brand. Change brand'
    );
    // an outline, not the chosen chip's fill
    expect(classes(chip()!)).not.toContain('bg-surface2');
    expect(chosen).toBeUndefined();
  });

  it("pre-selects the organization's one brand while no channels are picked", async () => {
    mockBrands = [BQ];
    await mount();

    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chosen).toBe('bq');
  });

  it('reads No brand when every picked channel is in no brand, as Samy then uses none', async () => {
    await mount();
    await pick('tt');

    expect(chip()!.textContent).toBe('No brand');
    expect(chosen).toBe('none');
  });

  it('C: opens the brand list for this message on a tap, the current brand ticked, with No brand and Manage brands', async () => {
    await mount();
    await pick('ig');

    await click(chip());

    expect(chip()!.getAttribute('aria-expanded')).toBe('true');
    expect(listbox()!.getAttribute('aria-label')).toBe(
      'Brand for this message'
    );
    expect(
      options().map((node) => node.querySelector('span span')?.textContent)
    ).toEqual(['Bayt Al Qahwa', 'Noor Dental', 'Rawda Florist', 'No brand']);
    expect(options().map((node) => node.getAttribute('aria-selected'))).toEqual(
      ['true', 'false', 'false', 'false']
    );
    // each brand's channels in the list, a disabled one too
    expect(option('Bayt Al Qahwa')!.textContent).toContain('3 channels');
    expect(option('Rawda Florist')!.textContent).toContain('1 channel');
    expect(option('No brand')!.textContent).toContain(
      'Sends no logo, examples or colours'
    );
    expect(document.querySelector('a[href="/brands"]')!.textContent).toContain(
      'Manage brands'
    );
  });

  it('D: goes without a brand on No brand', async () => {
    await mount();
    await pick('ig');

    await choose('No brand');

    expect(listbox()).toBeNull();
    expect(chip()!.textContent).toBe('No brand');
    expect(chip()!.querySelector('img')).toBeNull();
    // its crossed circle, and the chevron
    expect(chip()!.querySelectorAll('svg')).toHaveLength(2);
    expect(chip()!.getAttribute('aria-label')).toBe(
      'Brand for this message: No brand. Change brand'
    );
    expect(classes(chip()!)).not.toContain('bg-surface2');
    expect(chosen).toBe('none');
  });

  it("F: reads 2 brands when the picked channels span two, choosing each channel's brand, which the list offers first", async () => {
    await mount();
    await pick('ig', 'li');

    expect(chip()!.textContent).toContain('2 brands');
    expect(chipName()).toBeNull();
    // both brands' marks: Bayt Al Qahwa's logo and Noor Dental's initial
    expect(chip()!.querySelectorAll('img')).toHaveLength(1);
    expect(chip()!.textContent).toBe('N2 brands');
    expect(chip()!.getAttribute('aria-label')).toBe(
      'Brand for this message: 2 brands. Change brand'
    );
    expect(chosen).toBe('each');

    await click(chip());
    expect(options()[0].textContent).toContain("Each channel's brand");
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('F: counts the brands the picked channels span', async () => {
    mockChannels = [
      ...CHANNELS,
      channel('yt', { id: 'rf', name: 'Rawda Florist' }),
    ];
    await mount();
    await pick('ig', 'li', 'yt');

    expect(chip()!.textContent).toContain('3 brands');
    expect(chosen).toBe('each');
  });
});

describe("the user's own pick (FR-023)", () => {
  it('holds while the picked channels keep their brands', async () => {
    await mount();
    await pick('ig');

    await choose('Noor Dental');
    expect(chipName()!.textContent).toBe('Noor Dental');
    expect(chosen).toBe('nd');

    await pick('ig', 'fb');
    expect(chipName()!.textContent).toBe('Noor Dental');
    // a channel in no brand changes no brand
    await pick('ig', 'fb', 'tt');
    expect(chipName()!.textContent).toBe('Noor Dental');
    expect(chosen).toBe('nd');
  });

  it("gives way once the picked channels' brands change, and doesn't come back with them", async () => {
    await mount();
    await pick('ig');
    await choose('No brand');
    expect(chosen).toBe('none');

    await pick('ig', 'li');
    expect(chip()!.textContent).toContain('2 brands');
    expect(chosen).toBe('each');

    await pick('ig');
    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chosen).toBe('bq');
  });

  it('made while the chip waits, gives way once channels are picked', async () => {
    await mount();
    await choose('Rawda Florist');
    expect(chipName()!.textContent).toBe('Rawda Florist');
    expect(chosen).toBe('rf');

    await pick('ig');
    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chosen).toBe('bq');
  });

  it('falls back as if none had been made when the brand picked is deleted', async () => {
    const render = await mount();
    await pick('ig');
    await choose('Noor Dental');
    expect(chosen).toBe('nd');

    mockBrands = [BQ, RF];
    await render();

    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chosen).toBe('bq');
  });

  // The box puts the focus in the text on a click anywhere but a button,
  // which on a phone brings up the keyboard over the sheet just closed.
  it('leaves the focus on the chip after a pick, not in the text', async () => {
    await mount();
    await pick('ig');

    await choose('Noor Dental');

    expect(document.activeElement).toBe(chip());
    expect(document.activeElement).not.toBe(textarea());
  });
});

describe('on a phone (FR-026, board SamyPhoneSheet)', () => {
  beforeEach(() => {
    smallWindow = true;
  });

  it('opens the list as a bottom sheet named for this message', async () => {
    await mount();
    await pick('ig');

    await click(chip());

    const sheet = document.querySelector('[role="dialog"]')!;
    expect(sheet.getAttribute('aria-label')).toBe('Brand for this message');
    expect(sheet.contains(listbox())).toBe(true);
  });

  it("closes on the sheet's scrim, leaving the focus on the chip, not in the text", async () => {
    await mount();
    await pick('ig');
    await click(chip());

    await click(document.querySelector('.fixed.inset-0[aria-hidden="true"]'));

    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(chip());
  });
});

describe('the note on attached images (FR-024, state E)', () => {
  it("says, in the box between the images and the text, that they go in place of the brand's examples and its logo still goes along", async () => {
    await mount();
    await pick('ig');

    await attach('a', 'png');
    await attach('b', 'png');

    expect(note()!.textContent).toBe(
      "Your 2 images go in place of ⁨Bayt Al Qahwa⁩'s examples. Its logo still goes along."
    );
    expect(
      note()!.previousElementSibling!.querySelectorAll('img')
    ).toHaveLength(2);
    expect(note()!.nextElementSibling).toBe(textarea());
    // a decoration beside the words
    expect(note()!.querySelector('svg')!.getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  it('counts one image as one', async () => {
    await mount();
    await pick('ig');

    await attach('a', 'png');

    expect(note()!.textContent).toBe(
      "Your 1 image goes in place of ⁨Bayt Al Qahwa⁩'s examples. Its logo still goes along."
    );
  });

  it('counts images only: a video is no example', async () => {
    await mount();
    await pick('ig');

    await attach('v', 'mp4');
    expect(note()).toBeNull();

    await attach('a', 'png');
    expect(note()!.textContent).toContain('Your 1 image goes in place of');
  });

  it("names the brand the user picked, and says nothing without one: while the chip waits, on No brand or on each channel's brand", async () => {
    await mount();
    await attach('a', 'png');
    expect(note()).toBeNull();

    await choose('Noor Dental');
    expect(note()!.textContent).toContain('⁨Noor Dental⁩');

    await choose('No brand');
    expect(note()).toBeNull();

    await pick('ig', 'li');
    expect(chosen).toBe('each');
    expect(note()).toBeNull();
  });

  // The tray follows the chat when it appears; the note can come after it,
  // once an image joins a video, and takes its room from the chat too.
  it('keeps the chat at the bottom when it appears, as the tray does', async () => {
    jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(52);
    await mount();
    await pick('ig');
    const chat = document.querySelector<HTMLElement>('.copilotKitMessages')!;
    Object.defineProperty(chat, 'scrollHeight', { value: 1000 });
    Object.defineProperty(chat, 'clientHeight', { value: 400 });
    await attach('v', 'mp4');
    expect(note()).toBeNull();
    // the note's height is all that's below the fold
    chat.scrollTop = 1000 - 400 - 52;

    await attach('a', 'png');

    expect(note()).not.toBeNull();
    expect(chat.scrollTop).toBe(1000);
  });

  it('leaves the chat where it is if it was scrolled up', async () => {
    jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(52);
    await mount();
    await pick('ig');
    const chat = document.querySelector<HTMLElement>('.copilotKitMessages')!;
    Object.defineProperty(chat, 'scrollHeight', { value: 1000 });
    Object.defineProperty(chat, 'clientHeight', { value: 400 });
    await attach('v', 'mp4');
    chat.scrollTop = 100;

    await attach('a', 'png');

    expect(chat.scrollTop).toBe(100);
  });

  it('uses the shapes and colours of the box, on logical sides only', async () => {
    await mount();
    await pick('ig');
    await attach('a', 'png');

    expect(classes(note()!)).toEqual(
      expect.arrayContaining(['flex', 'bg-aiSoft', 'text-ink', 'mx-[12px]'])
    );
    expect(note()!.querySelector('svg')!.getAttribute('class')).toContain(
      'text-aiAccent'
    );
  });
});

describe('in Arabic (board ChipStatesAR)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('ar');
  });

  it('waits with its Arabic words', async () => {
    await mount();

    expect(chip()!.textContent).toBe('اختر علامة تجارية');
    expect(chip()!.getAttribute('aria-label')).toBe(
      'العلامة التجارية لهذه الرسالة: اختر علامة تجارية. تغيير العلامة'
    );
  });

  it("keeps a brand's Latin name in its own direction", async () => {
    await mount();
    await pick('ig');

    expect(chipName()!.textContent).toBe('Bayt Al Qahwa');
    expect(chipName()!.getAttribute('dir')).toBe('auto');
    expect(chip()!.getAttribute('aria-label')).toBe(
      'العلامة التجارية لهذه الرسالة: Bayt Al Qahwa. تغيير العلامة'
    );
  });

  it('reads No brand and the count of brands in Arabic', async () => {
    await mount();
    await pick('ig', 'li');
    expect(chip()!.textContent).toContain('علامتان');

    await pick('ig');
    await choose('بلا علامة تجارية');
    expect(chip()!.textContent).toBe('بلا علامة تجارية');
  });

  it('says the note in Arabic, the brand isolated', async () => {
    await mount();
    await pick('ig');

    await attach('a', 'png');
    await attach('b', 'png');

    expect(note()!.textContent).toBe(
      'تحل صورتاك محل المنشورات النموذجية لـ⁨Bayt Al Qahwa⁩، ويبقى شعارها مرافقًا.'
    );
  });

  it('mirrors on logical sides only: no physical-side class in the row, the chip or the note', async () => {
    await mount();
    await pick('ig', 'li');
    await attach('a', 'png');
    await choose('Bayt Al Qahwa');

    const nodes = [
      row(),
      ...Array.from(row().querySelectorAll('*')),
      note()!,
      ...Array.from(note()!.querySelectorAll('*')),
    ];
    expect(nodes.flatMap(classes).filter(physical)).toEqual([]);
  });
});
