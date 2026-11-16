import { act, ComponentProps, ComponentType, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Samy's welcome, drawn where CopilotKit 1.72 draws its suggestions: the
// stand-in renders RenderSuggestionsList with the chat's suggestions inside
// footer.copilotKitMessagesFooter, and hands it the send that typing gets
// (handleSendMessage is both onSuggestionClick and the Input's onSend). The
// chat's own LoadMessages decides whether the chat is empty, and the real
// attachments provider holds the tray, as in agent.chat.input.spec.
const sent = jest.fn();
const inputProps: Array<ComponentProps<typeof Input>> = [];
const aiImageProps: Array<ComponentProps<typeof AiImage>> = [];
const params = { id: 'new' };
const chat = { messages: [] as Array<Record<string, unknown>> };
// The interface language: English draws each English default, Arabic each key,
// so every string is shown to come through its key.
const locale = { lang: 'en' };
// How far down CopilotKit has scrolled its list when the welcome arrives. It
// keeps the list at its bottom (useScrollToBottom), so on a chat too short for
// the block the list is already scrolled down; happy-dom lays nothing out, so
// the stand-in sets that offset itself.
const list = { scrollTop: 0 };

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: ({
    Input,
    suggestions,
    RenderSuggestionsList,
  }: {
    Input: ComponentType<{
      inProgress: boolean;
      onSend: (text: string) => void;
    }>;
    suggestions?: unknown[];
    RenderSuggestionsList: ComponentType<{
      suggestions: unknown[];
      onSuggestionClick: (message: string) => void;
      isLoading: boolean;
    }>;
  }) => (
    <>
      <div
        className="copilotKitMessages"
        ref={(element) => {
          if (element) {
            element.scrollTop = list.scrollTop;
          }
        }}
      >
        <div className="copilotKitMessagesContainer" />
        <footer className="copilotKitMessagesFooter">
          {suggestions?.length > 0 && (
            <RenderSuggestionsList
              suggestions={suggestions}
              onSuggestionClick={sent}
              isLoading={false}
            />
          )}
        </footer>
      </div>
      <Input inProgress={false} onSend={sent} />
    </>
  ),
  AssistantMessage: () => null,
}));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: { children: ReactNode }) => children,
  useCopilotAction: () => {},
  useCopilotChatInternal: () => ({
    messages: chat.messages,
    setMessages: () => {},
    isAvailable: true,
  }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: (props: ComponentProps<typeof Input>) => {
    inputProps.push(props);
    return (
      <div>
        <div data-attachments="">{props.attachments}</div>
        <div data-tools="">{props.tools}</div>
      </div>
    );
  },
}));
jest.mock('@gitroom/frontend/components/agents/agent.chat.header', () => ({
  ChatHeader: () => null,
  ChannelSummary: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: (props: { children: ReactNode }) => <div>{props.children}</div>,
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  PropertiesContext: jest
    .requireActual('react')
    .createContext({ properties: [] }),
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
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: ComponentProps<typeof AiImage>) => {
    aiImageProps.push(props);
    return <>{props.renderTrigger(() => undefined, false)}</>;
  },
}));
jest.mock('@gitroom/react/helpers/video.frame', () => ({
  VideoFrame: () => <video />,
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
jest.mock('next/navigation', () => ({ useParams: () => params }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) =>
    locale.lang === 'en' ? fallback ?? key : key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ messages: [] }) }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    language: 'en',
    dir: () => (locale.lang === 'ar' ? 'rtl' : 'ltr'),
  },
}));
// The media preview's Delete asks through deleteDialog, whose module sets up the
// app's i18next when it loads, which the stand-in above cannot.
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
// Markers that keep their props, so each icon's size is read as it is passed.
jest.mock('@gitroom/frontend/components/ui/icons', () => {
  const marker = (name: string) => {
    const Icon = (props: ComponentProps<'svg'> & { size?: number }) => (
      <svg data-icon={name} {...props} />
    );
    return Icon;
  };
  return {
    ...jest.requireActual('@gitroom/frontend/components/ui/icons'),
    SamyIcon: marker('SamyIcon'),
    CalendarIcon: marker('CalendarIcon'),
    TagIcon: marker('TagIcon'),
    InsertMediaIcon: marker('InsertMediaIcon'),
    BulbIcon: marker('BulbIcon'),
  };
});

import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import type { Input } from '@gitroom/frontend/components/agents/agent.input';
import type { AiImage } from '@gitroom/frontend/components/launches/ai.image';

const mounted: Root[] = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<AgentChat />);
  });
  return host;
};

const footer = (host: HTMLElement) =>
  host.querySelector('footer.copilotKitMessagesFooter')!;
const welcome = (host: HTMLElement) =>
  host.querySelector<HTMLElement>(
    'footer.copilotKitMessagesFooter > [data-samy-welcome]'
  );
const ideas = (host: HTMLElement) =>
  Array.from(welcome(host)!.querySelectorAll<HTMLButtonElement>('ul button'));
// The line and the hint: the block's own paragraphs, none inside an idea.
const paragraphs = (block: HTMLElement) =>
  Array.from(block.children)
    .filter((child) => child.tagName === 'P')
    .map((child) => child.textContent);
const input = () => inputProps[inputProps.length - 1];
const attach = async (id: string, ext: string) => {
  await act(async () =>
    aiImageProps[aiImageProps.length - 1].onChange({
      id,
      path: `https://media/${id}.${ext}`,
    })
  );
};

const IDEAS = [
  "Plan next week's posts",
  'Write a post about an offer',
  'Make an image for Instagram',
  'Give me post ideas for this month',
];

beforeEach(() => {
  params.id = 'new';
  chat.messages = [];
  locale.lang = 'en';
  list.scrollTop = 0;
  Object.assign(URL, {
    createObjectURL: jest.fn(() => 'blob:x'),
    revokeObjectURL: jest.fn(),
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  inputProps.length = 0;
  aiImageProps.length = 0;
  sent.mockClear();
});

describe('Samy’s welcome on a new chat', () => {
  it('is the footer’s only child, marked for its centring rule', async () => {
    const host = await mount();

    expect(welcome(host)).not.toBeNull();
    expect(footer(host).children).toHaveLength(1);
    expect(welcome(host)!.getAttribute('dir')).toBe('ltr');
  });

  it('opens at its top on a chat too short for it', async () => {
    list.scrollTop = 480;
    const host = await mount();
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });

    expect(welcome(host)).not.toBeNull();
    expect(
      host.querySelector<HTMLElement>('.copilotKitMessages')!.scrollTop
    ).toBe(0);
  });

  it('shows the tile with Samy’s icon, the heading, the line and the hint', async () => {
    const host = await mount();
    const block = welcome(host)!;
    const tile = block.firstElementChild!;
    const icon = tile.querySelector('svg')!;

    expect(tile.className.split(' ')).toEqual(
      expect.arrayContaining([
        'w-[48px]',
        'h-[48px]',
        'rounded-[14px]',
        'bg-brandSoft2',
        'text-brand',
      ])
    );
    expect(icon.getAttribute('data-icon')).toBe('SamyIcon');
    expect(icon.getAttribute('size')).toBe('26');
    expect(block.querySelector('h2')!.textContent).toBe("Hi, I'm Samy 👋");
    expect(paragraphs(block)).toEqual([
      "Tell me what you want to post. I'll write it, make the pictures and schedule it on your channels.",
      "Tick channels in the Channels panel and I'll post to those.",
    ]);
  });

  it('lists the four ideas as buttons in a list named Ideas to start', async () => {
    const host = await mount();
    const list = welcome(host)!.querySelector('ul')!;

    expect(list.getAttribute('aria-label')).toBe('Ideas to start');
    expect(
      Array.from(list.children).map((item) => item.tagName.toLowerCase())
    ).toEqual(['li', 'li', 'li', 'li']);
    expect(ideas(host).map((idea) => idea.textContent)).toEqual(IDEAS);
    expect(ideas(host).every((idea) => idea.type === 'button')).toBe(true);
  });

  // CalendarIcon and TagIcon draw at a fixed size and ignore `size`.
  it('gives each idea its 20px icon in the brand colour', async () => {
    const host = await mount();
    const icons = ideas(host).map((idea) => idea.querySelector('svg')!);

    expect(icons.map((icon) => icon.getAttribute('data-icon'))).toEqual([
      'CalendarIcon',
      'TagIcon',
      'InsertMediaIcon',
      'BulbIcon',
    ]);
    icons.slice(0, 2).forEach((icon) => {
      expect(icon.getAttribute('width')).toBe('20');
      expect(icon.getAttribute('height')).toBe('20');
      expect(icon.hasAttribute('size')).toBe(false);
    });
    icons.slice(2).forEach((icon) => {
      expect(icon.getAttribute('size')).toBe('20');
    });
    icons.forEach((icon) =>
      expect(icon.getAttribute('class')).toContain('text-brand')
    );
  });

  it('gives every idea the focus ring and a 52px floor', async () => {
    const host = await mount();

    ideas(host).forEach((idea) => {
      expect(idea.className.split(' ')).toEqual(
        expect.arrayContaining(['min-h-[52px]', ...FOCUS_RING.split(' ')])
      );
    });
  });

  it('draws no Regenerate, Copy or thumbs control', async () => {
    const host = await mount();
    const block = welcome(host)!;

    expect(block.querySelectorAll('button')).toHaveLength(4);
    expect(block.querySelectorAll('ul button')).toHaveLength(4);
    expect(block.textContent).not.toMatch(/regenerate|copy|thumbs/i);
  });

  it('keeps the words outside the ideas to 35 at most', async () => {
    const host = await mount();
    const block = welcome(host)!.cloneNode(true) as HTMLElement;
    block.querySelector('ul')!.remove();
    const words = block
      .textContent!.split(/\s+/)
      .filter((word) => /\p{L}/u.test(word));

    expect(words.length).toBeLessThanOrEqual(35);
  });

  it('draws each string through its key, right to left, in Arabic', async () => {
    locale.lang = 'ar';
    const host = await mount();
    const block = welcome(host)!;

    expect(block.getAttribute('dir')).toBe('rtl');
    expect(block.querySelector('h2')!.textContent).toBe('samy_welcome_title');
    expect(paragraphs(block)).toEqual([
      'samy_welcome_line',
      'samy_welcome_hint',
    ]);
    expect(block.querySelector('ul')!.getAttribute('aria-label')).toBe(
      'samy_welcome_ideas'
    );
    expect(ideas(host).map((idea) => idea.textContent)).toEqual([
      'samy_idea_plan_week',
      'samy_idea_offer_post',
      'samy_idea_instagram_image',
      'samy_idea_month_ideas',
    ]);
  });
});

describe('tapping an idea', () => {
  it('sends it as typing does, with the images’ block, and clears the tray', async () => {
    const host = await mount();
    await attach('a', 'png');

    await act(async () => {
      ideas(host)[0].click();
    });

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(
      "Plan next week's posts\n[--Media--]Image: https://media/a.png\n[--Media--]"
    );
    expect(
      host.querySelector('[data-attachments]')!.querySelectorAll('img')
    ).toHaveLength(0);
  });

  it('sends the idea alone when nothing is attached', async () => {
    const host = await mount();

    await act(async () => {
      ideas(host)[3].click();
    });

    expect(sent).toHaveBeenCalledWith('Give me post ideas for this month');
  });

  it('waits while an image uploads', async () => {
    const host = await mount();

    await act(async () =>
      input().onPasteFiles([new File(['a'], 'a.png', { type: 'image/png' })])
    );

    expect(ideas(host).map((idea) => idea.disabled)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('a chat with messages', () => {
  it('leaves the footer empty', async () => {
    chat.messages = [{ id: 'm1', role: 'user', content: 'hello' }];
    const host = await mount();

    expect(footer(host).childNodes).toHaveLength(0);
  });
});
