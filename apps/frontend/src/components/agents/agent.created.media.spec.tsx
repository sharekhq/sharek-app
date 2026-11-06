import { act, ReactNode, SyntheticEvent } from 'react';
import { createRoot, Root } from 'react-dom/client';

// An image Samy made, in the chat. CopilotKit draws a tool call through the card
// registered for its name, and reports `InProgress` for ever when a call has no
// result, so whether a card may wait comes from outside it.
const openModal = jest.fn();
const previewed: Array<{ items: unknown[]; index: number }> = [];

// Any component using this hook detaches the running reply when it unmounts, and
// cards come and go, so a card that called it would cut replies short.
jest.mock('@copilotkit/react-core', () => ({
  useCopilotChatInternal: () => {
    throw new Error('A card must never call useCopilotChatInternal');
  },
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
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

import {
  CardMayWaitContext,
  CreatedImage,
  isInLatestExchange,
  keepChatAtBottom,
} from '@gitroom/frontend/components/agents/agent.created.media';

const mounted: Root[] = [];

const show = async (result: unknown, mayWait = false) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const wrap = (children: ReactNode) => (
    <CardMayWaitContext.Provider value={mayWait}>
      {children}
    </CardMayWaitContext.Provider>
  );
  await act(async () => {
    root.render(wrap(<CreatedImage result={result as any} />));
  });
  return host;
};

const classes = (node: Element) => node.className.split(/\s+/);

const MADE = { id: 'm1', path: 'https://media.sharek.app/made.png' };

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  previewed.length = 0;
  openModal.mockClear();
});

describe('a card while the image is being made', () => {
  it('is a square with the AI image window’s words and no icon', async () => {
    const host = await show(undefined, true);

    expect(host.textContent).toContain('Creating your image…');
    expect(host.textContent).toContain('Usually takes about half a minute');
    expect(host.textContent).not.toContain('✦');
    expect(host.querySelector('svg')).toBeNull();

    const card = host.firstElementChild as HTMLElement;
    expect(classes(card)).toEqual(
      expect.arrayContaining(['aspect-square', 'rounded-[16px]'])
    );
  });

  // The fill pulses and the words hold still, so they stay readable, and the
  // pulse goes for anyone who has asked for less motion.
  it('pulses its fill and not its words', async () => {
    const host = await show(undefined, true);

    const fill = host.querySelector('.bg-surface2') as HTMLElement;
    expect(classes(fill)).toContain('motion-safe:animate-pulse');
    expect(fill.textContent).toBe('');
    expect(classes(fill)).not.toContain('animate-pulse');
  });

  it('shows nothing once it may no longer wait, which is how a stopped card ends', async () => {
    const host = await show(undefined, false);

    expect(host.innerHTML).toBe('');
  });
});

describe('the image', () => {
  it('is named, and sized by the picture', async () => {
    const host = await show(MADE);

    const picture = host.querySelector('img') as HTMLImageElement;
    expect(picture.getAttribute('src')).toBe(MADE.path);
    expect(classes(picture)).toEqual(
      expect.arrayContaining(['max-h-[480px]', 'rounded-[16px]'])
    );
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Image Samy made'
    );
  });

  // Nothing holds a picture's size until it has downloaded, so the card keeps the
  // chat's room, and there's no button with nothing to see in the meantime.
  it('replaces the card once the picture has loaded, not before', async () => {
    const host = await show(MADE, true);

    expect(host.textContent).toContain('Creating your image…');
    expect(host.querySelector('button')).toBeNull();
    const loading = host.querySelector('img') as HTMLImageElement;
    expect(loading.getAttribute('src')).toBe(MADE.path);
    expect(classes(loading)).toContain('hidden');

    await act(async () => {
      loading.dispatchEvent(new Event('load'));
    });

    expect(host.textContent).not.toContain('Creating your image…');
    expect(host.querySelector('button')).not.toBeNull();
    expect(classes(host.querySelector('img')!)).not.toContain('hidden');
  });

  it('says it is gone if the picture can’t load while the card holds', async () => {
    const host = await show(MADE, true);

    await act(async () => {
      host.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe('This image is no longer available');
  });

  // A reopened chat has no card to hold, and a run that ended has nothing to wait for.
  it('shows at once when it may not wait, because the result is what counts', async () => {
    const host = await show(MADE, false);

    expect(host.textContent).not.toContain('Creating your image…');
    expect(classes(host.querySelector('img')!)).not.toContain('hidden');
    expect(host.querySelector('button')).not.toBeNull();
  });

  it('opens in the Media library’s viewer, with one item and no new buttons', async () => {
    const host = await show(MADE);

    expect(host.querySelectorAll('button')).toHaveLength(1);
    await act(async () => {
      host
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(previewed).toEqual([
      {
        items: [{ id: MADE.path, path: MADE.path, name: 'made.png' }],
        index: 0,
      },
    ]);
    expect(openModal).toHaveBeenCalledTimes(1);
  });

  it('has a visible focus ring, because a global rule removes outlines', async () => {
    const host = await show(MADE);

    expect(classes(host.querySelector('button')!)).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  // Chrome reports a picture dragged inside the page as a file, which would come
  // back through the drop zone as a new upload.
  it('can’t be dragged back onto the chat', async () => {
    const host = await show(MADE);

    expect(host.querySelector('img')?.getAttribute('draggable')).toBe('false');
  });

  it('says it is gone when the picture can’t load, in the same place', async () => {
    const host = await show(MADE);

    await act(async () => {
      host.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe('This image is no longer available');
  });
});

describe('a result with no image in it', () => {
  it.each([
    ['may still wait', true],
    ['may no longer wait', false],
  ])('shows nothing for a refusal when it %s', async (_name, mayWait) => {
    const host = await show({ error: 'No credits.' }, mayWait);

    expect(host.innerHTML).toBe('');
  });

  it('shows nothing for a result that was not JSON', async () => {
    const host = await show('Something went wrong', true);

    expect(host.innerHTML).toBe('');
  });

  // These reach an image source and the viewer's external link, as sent media does.
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AA',
    '/uploads/a.png',
  ])('shows nothing for a link that is %s', async (path) => {
    const host = await show({ id: 'm1', path }, true);

    expect(host.innerHTML).toBe('');
  });
});

describe('the size of a card', () => {
  // The column, not the window: both side panels stay until 1025px, so the chat can
  // be narrower than 420px with the window far wider.
  const ALONE = 'min(420px,100cqw)';

  // The row sees the cards as its own children, so one alone can tell.
  it('lets an image alone reach 420px, and one in a row 190px, or 150px on a phone', async () => {
    const host = await show(MADE);

    expect(classes(host.querySelector('button')!)).toContain('group');
    expect(classes(host.querySelector('img')!)).toEqual(
      expect.arrayContaining([
        'max-w-[190px]',
        'phone:max-w-[150px]',
        `group-only:max-w-[${ALONE}]`,
      ])
    );
  });

  it('does the same for a waiting card', async () => {
    const host = await show(undefined, true);

    expect(classes(host.firstElementChild!)).toEqual(
      expect.arrayContaining([
        'w-[190px]',
        'phone:w-[150px]',
        `only:w-[${ALONE}]`,
      ])
    );
  });
});

describe('isInLatestExchange', () => {
  const messages = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant' },
    { id: 'u2', role: 'user' },
    { id: 'a2', role: 'assistant' },
    { id: 't2', role: 'tool' },
    { id: 'a3', role: 'assistant' },
  ];

  it('holds for everything after the latest user message', () => {
    expect(isInLatestExchange(messages, 'a2')).toBe(true);
    expect(isInLatestExchange(messages, 'a3')).toBe(true);
  });

  it('does not hold for anything before it', () => {
    expect(isInLatestExchange(messages, 'a1')).toBe(false);
  });

  it('does not hold for a message it can’t find', () => {
    expect(isInLatestExchange(messages, 'gone')).toBe(false);
    expect(isInLatestExchange(undefined, 'a1')).toBe(false);
  });
});

// An image load changes no DOM the chat's own scrolling watches, and by the time
// it runs the list has already grown.
describe('keepChatAtBottom', () => {
  const chatAt = (scrollTop: number) => {
    const chat = document.createElement('div');
    chat.className = 'copilotKitMessages';
    const picture = document.createElement('img');
    chat.appendChild(picture);
    document.body.appendChild(chat);
    Object.defineProperty(chat, 'scrollHeight', { value: 1000 });
    Object.defineProperty(chat, 'clientHeight', { value: 400 });
    Object.defineProperty(picture, 'offsetHeight', { value: 200 });
    chat.scrollTop = scrollTop;
    const event = {
      currentTarget: picture,
    } as unknown as SyntheticEvent<HTMLImageElement>;
    return { chat, event };
  };

  it('follows a picture that loaded while the chat was at the bottom', () => {
    // The picture's 200px are all that's below the fold.
    const { chat, event } = chatAt(400);

    keepChatAtBottom(event);

    expect(chat.scrollTop).toBe(1000);
  });

  it('leaves a chat that was scrolled up where it is', () => {
    const { chat, event } = chatAt(100);

    keepChatAtBottom(event);

    expect(chat.scrollTop).toBe(100);
  });

  it('runs when a card’s picture loads', async () => {
    const chat = document.createElement('div');
    chat.className = 'copilotKitMessages';
    document.body.appendChild(chat);
    Object.defineProperty(chat, 'scrollHeight', { value: 1000 });
    Object.defineProperty(chat, 'clientHeight', { value: 1000 });
    const root = createRoot(chat);
    mounted.push(root);
    await act(async () => {
      root.render(<CreatedImage result={MADE} />);
    });
    chat.scrollTop = 0;

    await act(async () => {
      chat.querySelector('img')!.dispatchEvent(new Event('load'));
    });

    expect(chat.scrollTop).toBe(1000);
  });

  // Its size was known as soon as the card went, and that change is one the chat's
  // own scrolling watches, so nothing here should pull a reader back down.
  it('stays out of it when the picture replaces a card', async () => {
    const chat = document.createElement('div');
    chat.className = 'copilotKitMessages';
    document.body.appendChild(chat);
    Object.defineProperty(chat, 'scrollHeight', { value: 1000 });
    Object.defineProperty(chat, 'clientHeight', { value: 1000 });
    const root = createRoot(chat);
    mounted.push(root);
    await act(async () => {
      root.render(
        <CardMayWaitContext.Provider value={true}>
          <CreatedImage result={MADE} />
        </CardMayWaitContext.Provider>
      );
    });
    await act(async () => {
      chat.querySelector('img')!.dispatchEvent(new Event('load'));
    });
    chat.scrollTop = 0;

    await act(async () => {
      chat.querySelector('img')!.dispatchEvent(new Event('load'));
    });

    expect(chat.scrollTop).toBe(0);
  });

  it('does nothing outside a chat', () => {
    const picture = document.createElement('img');

    expect(() =>
      keepChatAtBottom({
        currentTarget: picture,
      } as unknown as SyntheticEvent<HTMLImageElement>)
    ).not.toThrow();
  });
});
