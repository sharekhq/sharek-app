import { act, FC } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The user's own bubble in Samy's chat. Threads belong to the organization, so
// a teammate who opens one sees these messages too. Module shells as in
// agent.chat.language.spec; the chat shell renders the bubble slot with the
// message each case sets. Media comes first and words go in as a plain text
// child, so nothing in a message can add markup to the page.
let message: { id: string; role: string; content: string };
const openModal = jest.fn();
const previewed: Array<{ items: unknown[]; index: number }> = [];

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: ({ UserMessage }: { UserMessage: FC<{ message: unknown }> }) => (
    <UserMessage message={message} />
  ),
  AssistantMessage: () => null,
}));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: any) => children,
  useCopilotAction: () => {},
  useCopilotChatInternal: () => ({
    messages: [],
    setMessages: () => {},
    isAvailable: true,
  }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  PropertiesContext: jest
    .requireActual('react')
    .createContext({ properties: [] }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.attachments', () => ({
  AttachmentsProvider: ({ children }: any) => children,
  AttachmentsTray: () => null,
  AttachmentTools: () => null,
  AttachmentsDropOverlay: () => null,
  PlayBadge: () => <span data-play-badge="" />,
  useAttachments: () => ({
    tiles: [],
    attached: [],
    uploading: false,
    addFiles: () => {},
    addMedia: () => {},
    remove: () => {},
    clear: () => {},
  }),
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: any) => children,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal }),
}));
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  mediaPreviewModal: (items: unknown[], index: number) => {
    previewed.push({ items, index });
    return { items, index };
  },
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'new' }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ messages: [] }) }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('i18next', () => ({ __esModule: true, default: { language: 'en' } }));

import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

const mounted: Root[] = [];

const showMessage = async (content: string) => {
  message = { id: 'm1', role: 'user', content };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<AgentChat />);
  });
  return host.querySelector('.copilotKitUserMessage') as HTMLElement;
};

const block = (...lines: string[]) =>
  `[--Media--]${lines.join('\n')}\n[--Media--]`;
const IMAGE = 'https://media.sharek.app/a.png';
const IMAGE_2 = 'https://media.sharek.app/c.png';
const VIDEO = 'https://media.sharek.app/b.mp4';

const classes = (node: Element) => node.className.split(/\s+/);

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const fail = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new Event('error'));
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  previewed.length = 0;
  openModal.mockClear();
});

describe("the user's message in Samy's chat", () => {
  it('does not turn markup typed into it into elements', async () => {
    const bubble = await showMessage(
      'Make a post about <img src=x onerror="document.title=1"> coffee'
    );

    expect(bubble.querySelector('[onerror]')).toBeNull();
    expect(bubble.querySelector('img[src="x"]')).toBeNull();
    expect(bubble.textContent).toBe(
      'Make a post about <img src=x onerror="document.title=1"> coffee'
    );
  });

  // A typed link no longer loads a picture for teammates reading the thread.
  it('shows a hand-typed picture line as words, and loads nothing', async () => {
    const bubble = await showMessage(
      `Image: ${IMAGE}" onerror="document.title=1\nUse this one`
    );

    expect(bubble.querySelector('img')).toBeNull();
    expect(bubble.textContent).toContain(`Image: ${IMAGE}`);
  });

  it('adds no attribute for a quote inside a link', async () => {
    const bubble = await showMessage(
      block(`Image: ${IMAGE}" onerror="document.title=1`)
    );

    expect(bubble.querySelector('[onerror]')).toBeNull();
    expect(bubble.querySelector('img')?.getAttribute('src')).toBe(IMAGE);
  });

  // The app's tooltip renders data-tooltip-html as HTML on hover.
  it('does not let the text bring its own tooltip markup', async () => {
    const bubble = await showMessage(
      '<span data-tooltip-id="tooltip" data-tooltip-html="<img src=x onerror=document.title=1>">hover</span>'
    );

    expect(bubble.querySelector('[data-tooltip-html]')).toBeNull();
  });

  it('keeps a message with no media as it was', async () => {
    const bubble = await showMessage('Just some words');

    expect(bubble.getAttribute('dir')).toBe('auto');
    expect(bubble.className).toBe(
      'copilotKitMessage copilotKitUserMessage min-w-[300px]'
    );
    expect(bubble.textContent).toBe('Just some words');
    expect(bubble.children).toHaveLength(0);
  });

  it('still strips an integrations block', async () => {
    const bubble = await showMessage(
      'Schedule this\n[--integrations--]\nUse these: [{"id":"abc"}]\n[--integrations--]'
    );

    expect(bubble.textContent).toBe('Schedule this');
  });
});

describe('a message with one image', () => {
  it('shows the image first and the words under it, in its own proportions', async () => {
    const bubble = await showMessage(`Look at this\n${block(`Image: ${IMAGE}`)}`);
    const img = bubble.querySelector('img')!;

    expect(img.getAttribute('src')).toBe(IMAGE);
    expect(classes(img)).toEqual(
      expect.arrayContaining([
        'max-w-[200px]',
        'max-h-[200px]',
        'phone:max-w-[160px]',
        'phone:max-h-[160px]',
        'rounded-[12px]',
      ])
    );
    expect(classes(img).filter((c) => /^border/.test(c))).toEqual([]);
    expect(classes(img)).not.toContain('object-cover');

    const words = bubble.lastElementChild!;
    expect(words.textContent).toBe('Look at this');
    expect(
      bubble.firstElementChild!.compareDocumentPosition(words) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(bubble.getAttribute('dir')).toBe('auto');
  });

  it('holds no words box when there are no words', async () => {
    const bubble = await showMessage(block(`Image: ${IMAGE}`));

    expect(bubble.children).toHaveLength(1);
    expect(bubble.textContent).toBe('');
  });
});

describe('a message with several images', () => {
  it('shows even squares in a wrapping row', async () => {
    const bubble = await showMessage(
      block(`Image: ${IMAGE}`, `Image: ${IMAGE_2}`)
    );
    const images = Array.from(bubble.querySelectorAll('img'));

    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(classes(img)).toEqual(
        expect.arrayContaining([
          '!w-[120px]',
          '!h-[120px]',
          'phone:!w-[96px]',
          'phone:!h-[96px]',
          'object-cover',
          'rounded-[12px]',
        ])
      );
      expect(classes(img)).not.toContain('max-w-[200px]');
    }
    expect(classes(bubble.firstElementChild!)).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap', 'gap-[6px]'])
    );
  });
});

describe('a video in a message', () => {
  it('shows a picture with a play badge and no controls', async () => {
    const bubble = await showMessage(block(`Video: ${VIDEO}`));
    const video = bubble.querySelector('video')!;

    expect(video.getAttribute('src')).toBe(`${VIDEO}#t=0.1`);
    expect(video.hasAttribute('controls')).toBe(false);
    expect(bubble.querySelector('[data-play-badge]')).not.toBeNull();
    expect(classes(video.parentElement!)).toEqual(
      expect.arrayContaining([
        'w-[120px]',
        'h-[120px]',
        'phone:w-[96px]',
        'phone:h-[96px]',
        'rounded-[12px]',
        'overflow-hidden',
      ])
    );
  });
});

describe('opening media from a message', () => {
  it('opens an image in the viewer, as a list of one', async () => {
    const bubble = await showMessage(
      block(`Image: ${IMAGE}`, `Image: ${IMAGE_2}`)
    );

    await click(bubble.querySelectorAll('button')[1]);

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(previewed).toEqual([
      {
        items: [{ id: IMAGE_2, path: IMAGE_2, name: 'c.png' }],
        index: 0,
      },
    ]);
    expect(openModal).toHaveBeenCalledWith(previewed[0]);
  });

  it('opens a video in the viewer, which plays it', async () => {
    const bubble = await showMessage(block(`Video: ${VIDEO}`));

    await click(bubble.querySelector('button')!);

    expect(previewed).toEqual([
      { items: [{ id: VIDEO, path: VIDEO, name: 'b.mp4' }], index: 0 },
    ]);
  });

  it('makes each item a named button with a focus ring', async () => {
    const bubble = await showMessage(
      block(`Image: ${IMAGE}`, `Video: ${VIDEO}`)
    );
    const buttons = Array.from(bubble.querySelectorAll('button'));

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'samy_attached_image',
      'samy_attached_video',
    ]);
    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button');
      expect(classes(button)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    }
  });
});

describe('media that fails to load', () => {
  it('says the image is gone, and the rest of the message stands', async () => {
    const bubble = await showMessage(
      `Look\n${block(`Image: ${IMAGE}`, `Image: ${IMAGE_2}`)}`
    );

    await fail(bubble.querySelector('img')!);

    expect(bubble.textContent).toContain('samy_image_unavailable');
    expect(bubble.querySelectorAll('img')).toHaveLength(1);
    expect(bubble.textContent).toContain('Look');
  });

  it('says the video is gone', async () => {
    const bubble = await showMessage(block(`Video: ${VIDEO}`));

    await fail(bubble.querySelector('video')!);

    expect(bubble.textContent).toContain('samy_video_unavailable');
    expect(bubble.querySelector('video')).toBeNull();
    expect(bubble.querySelector('button')).toBeNull();
  });
});
