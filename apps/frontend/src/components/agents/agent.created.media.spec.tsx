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
const statusCheck = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => statusCheck,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SWRConfig } from 'swr';
import {
  CardMayWaitContext,
  CreatedImage,
  CreatedVideo,
  drawsWaitingCard,
  isInLatestExchange,
  keepChatAtBottom,
  ReportedVideo,
} from '@gitroom/frontend/components/agents/agent.created.media';

const mounted: Root[] = [];

const show = async (result: unknown, mayWait = false, args?: unknown) => {
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
    root.render(
      wrap(<CreatedImage result={result as any} args={args as any} />)
    );
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
    expect(classes(card)).toContain('rounded-[16px]');
    expect(card.style.getPropertyValue('--card-ratio')).toBe('1');
  });

  // The shape the tool was asked for, so the picture lands in the room the card
  // kept. The catalog is what the AI image window reads too.
  describe('takes the shape being made', () => {
    const ratioOf = async (args: unknown) => {
      const host = await show(undefined, true, args);
      return (host.firstElementChild as HTMLElement).style.getPropertyValue(
        '--card-ratio'
      );
    };

    it.each([
      ['square', 1],
      ['portrait', 4 / 5],
      ['story', 9 / 16],
      ['landscape', 16 / 9],
    ])('for %s', async (aspectRatio, ratio) => {
      expect(Number(await ratioOf({ aspectRatio }))).toBeCloseTo(ratio, 5);
    });

    // A row stored before this tool has no aspectRatio, and a value still streaming
    // in is a part of a word.
    it.each([
      ['no arguments', undefined],
      ['no shape', {}],
      ['a part of a word', { aspectRatio: 'stor' }],
      ['a name every object has', { aspectRatio: 'constructor' }],
    ])('square for %s', async (_name, args) => {
      expect(await ratioOf(args)).toBe('1');
    });

    it('draws its ratio from that value', async () => {
      const host = await show(undefined, true, { aspectRatio: 'story' });

      expect(classes(host.firstElementChild!)).toContain(
        'aspect-[var(--card-ratio)]'
      );
    });
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

  // The picture stops at 480px tall, so a tall card alone is as wide as that allows,
  // or a story's card would stand 747px high and shrink when its picture landed.
  it('does the same for a waiting card, which stops as tall as a picture does', async () => {
    const host = await show(undefined, true);

    expect(classes(host.firstElementChild!)).toEqual(
      expect.arrayContaining([
        'w-[190px]',
        'phone:w-[150px]',
        'only:w-[min(420px,calc(480px*var(--card-ratio)),100cqw)]',
      ])
    );
  });
});

describe('a video card', () => {
  const JOB = 'video_org-1_abc';
  const STATUS_URL = `/media/generate-video/${JOB}/status`;
  const VIDEO = 'https://media.sharek.app/made.mp4';
  const MINUTE = 60 * 1000;

  const answer = (status: number, body: unknown = {}) => ({
    status,
    ok: status < 400,
    json: async () => body,
  });
  const pending = () => answer(200, { status: 'pending' });
  const completed = () =>
    answer(200, { status: 'completed', id: 'm1', path: VIDEO });

  const settle = async (ms = 0) => {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  };

  const showVideo = async (
    result: unknown,
    {
      mayWait = false,
      args = { output: 'vertical' } as unknown,
      cache = new Map(),
    } = {}
  ) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    const draw = (waiting: boolean) =>
      root.render(
        <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
          <CardMayWaitContext.Provider value={waiting}>
            <CreatedVideo result={result as any} args={args as any} />
          </CardMayWaitContext.Provider>
        </SWRConfig>
      );
    await act(async () => {
      draw(mayWait);
    });
    await settle();
    return {
      host,
      redraw: (waiting: boolean) =>
        act(async () => {
          draw(waiting);
        }),
      close: () =>
        act(async () => {
          root.unmount();
          mounted.splice(mounted.indexOf(root), 1);
        }),
    };
  };

  const ratioOf = (host: Element) =>
    Number(
      (host.firstElementChild as HTMLElement).style.getPropertyValue(
        '--card-ratio'
      )
    );

  const RENDERING = 'Your video is rendering';
  const POINTER = "If this video finished, it's in your Media library";

  beforeEach(() => {
    jest.useFakeTimers();
    statusCheck.mockReset();
    statusCheck.mockImplementation(async () => pending());
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    jest.useRealTimers();
  });

  describe('while it renders', () => {
    it('says so, with no icon, and pulses', async () => {
      const { host } = await showVideo({ jobId: JOB });

      expect(host.textContent).toContain(RENDERING);
      expect(host.textContent).toContain(
        "It will play here when it's ready. You can keep chatting."
      );
      expect(host.querySelector('svg')).toBeNull();
      expect(classes(host.querySelector('.bg-surface2')!)).toContain(
        'motion-safe:animate-pulse'
      );
    });

    it.each([
      ['vertical', 9 / 16],
      ['horizontal', 16 / 9],
    ])('takes the shape of a %s video', async (output, ratio) => {
      const { host } = await showVideo({ jobId: JOB }, { args: { output } });

      expect(ratioOf(host)).toBeCloseTo(ratio, 5);
    });

    it('checks on the job every 10 seconds, at its own address', async () => {
      await showVideo({ jobId: JOB });

      expect(statusCheck).toHaveBeenCalledTimes(1);
      expect(statusCheck).toHaveBeenCalledWith(STATUS_URL);

      await settle(10 * 1000);
      expect(statusCheck).toHaveBeenCalledTimes(2);

      await settle(10 * 1000);
      expect(statusCheck).toHaveBeenCalledTimes(3);
    });

    // Or a playing video could flip to the pointer a day later.
    it('doesn’t check again because the window came back', async () => {
      await showVideo({ jobId: JOB });
      statusCheck.mockClear();

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await settle(1000);

      expect(statusCheck).not.toHaveBeenCalled();
    });

    // SWR doesn't revalidate while its cache holds an error, so one blip would
    // otherwise end the checks and leave the card waiting out its 45 minutes.
    it.each([
      ['a server error', async () => answer(500)],
      [
        'a dropped connection',
        async () => {
          throw new TypeError('Failed to fetch');
        },
      ],
    ])('goes on checking after %s', async (_name, failure) => {
      statusCheck.mockImplementationOnce(failure);

      const { host } = await showVideo({ jobId: JOB });
      expect(host.textContent).toContain(RENDERING);

      statusCheck.mockImplementation(async () => completed());
      await settle(10 * 1000);

      expect(host.querySelector('video')).not.toBeNull();
    });

    // The chat tells them to keep chatting, and a render must not push the check
    // back every time, or a busy chat would never see its video.
    it('keeps to its 10 seconds while the page draws it again', async () => {
      const { redraw } = await showVideo({ jobId: JOB });
      statusCheck.mockClear();

      for (let second = 0; second < 12; second += 3) {
        await redraw(second % 2 === 0);
        await settle(3 * 1000);
      }

      expect(statusCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe('once it’s ready', () => {
    const playable = async () => {
      const { host } = await showVideo({ jobId: JOB });
      statusCheck.mockImplementation(async () => completed());
      await settle(10 * 1000);
      return host;
    };

    it('plays in place, with no reload', async () => {
      const host = await playable();

      const video = host.querySelector('video') as HTMLVideoElement;
      // The fragment VideoFrame adds is what gives a still frame before play.
      expect(video.getAttribute('src')).toBe(`${VIDEO}#t=0.1`);
      expect(video.hasAttribute('controls')).toBe(true);
      expect(video.hasAttribute('playsinline')).toBe(true);
      expect(video.getAttribute('preload')).toBe('metadata');
      expect(host.textContent).not.toContain(RENDERING);
    });

    it('stops checking', async () => {
      await playable();
      statusCheck.mockClear();

      await settle(60 * MINUTE);

      expect(statusCheck).not.toHaveBeenCalled();
    });

    it('stays within the same limits as an image', async () => {
      const host = await playable();

      expect(classes(host.firstElementChild!)).toContain('group');
      expect(classes(host.querySelector('video')!)).toEqual(
        expect.arrayContaining([
          'max-w-[190px]',
          'phone:max-w-[150px]',
          'group-only:max-w-[min(420px,100cqw)]',
          'max-h-[480px]',
          'rounded-[16px]',
        ])
      );
    });

    it('says it is gone when it can’t load, in the same place', async () => {
      const host = await playable();

      await act(async () => {
        host.querySelector('video')!.dispatchEvent(new Event('error'));
      });

      expect(host.querySelector('video')).toBeNull();
      expect(host.textContent).toBe('This video is no longer available');
    });

    // A card remounts when the chat is written again, and checks once when it does.
    it.each([
      ['a server error', async () => answer(500)],
      [
        'a dropped connection',
        async () => {
          throw new TypeError('Failed to fetch');
        },
      ],
    ])('keeps playing through %s on a remount', async (_name, failure) => {
      const cache = new Map();
      statusCheck.mockImplementation(async () => completed());
      const first = await showVideo({ jobId: JOB }, { cache });
      expect(first.host.querySelector('video')).not.toBeNull();
      await first.close();

      statusCheck.mockImplementation(failure);
      const { host } = await showVideo({ jobId: JOB }, { cache });
      await settle(1000);

      expect(statusCheck).toHaveBeenCalled();
      expect(host.querySelector('video')).not.toBeNull();
    });

    it('ignores a finished job with no usable link', async () => {
      statusCheck.mockImplementation(async () =>
        answer(200, { status: 'completed', path: 'javascript:alert(1)' })
      );

      const { host } = await showVideo({ jobId: JOB });

      expect(host.querySelector('video')).toBeNull();
    });
  });

  it('says a failed video couldn’t be made, without pulsing or checking again', async () => {
    statusCheck.mockImplementation(async () =>
      answer(200, { status: 'failed' })
    );

    const { host } = await showVideo({ jobId: JOB });
    statusCheck.mockClear();
    await settle(MINUTE);

    expect(host.textContent).toContain("This video couldn't be made");
    expect(host.textContent).not.toContain(RENDERING);
    expect(host.innerHTML).not.toContain('animate-pulse');
    expect(statusCheck).not.toHaveBeenCalled();
  });

  describe('when its status can’t be found', () => {
    it('points to the Media library, and doesn’t say it failed or is gone', async () => {
      statusCheck.mockImplementation(async () => answer(404));

      const { host } = await showVideo({ jobId: JOB });
      statusCheck.mockClear();
      await settle(MINUTE);

      expect(host.textContent).toContain(POINTER);
      expect(host.textContent).not.toMatch(/couldn't be made|no longer/);
      expect(host.querySelector('a')?.getAttribute('href')).toBe('/media');
      expect(classes(host.querySelector('a')!)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
      expect(host.innerHTML).not.toContain('animate-pulse');
      expect(statusCheck).not.toHaveBeenCalled();
    });
  });

  describe('45 minutes after it started', () => {
    it('stops a live card, by the clock alone, since a same answer changes nothing', async () => {
      const { host } = await showVideo({ jobId: JOB });

      await settle(45 * MINUTE - 1000);
      expect(host.textContent).toContain(RENDERING);

      await settle(1000);
      expect(host.textContent).toContain(POINTER);
      statusCheck.mockClear();

      await settle(30 * MINUTE);
      expect(statusCheck).not.toHaveBeenCalled();
    });

    it('counts a reopened card from when it started', async () => {
      const startedAt = new Date(Date.now() - 44 * MINUTE).toISOString();

      const { host } = await showVideo({ jobId: JOB, startedAt });
      expect(host.textContent).toContain(RENDERING);

      await settle(MINUTE);
      expect(host.textContent).toContain(POINTER);
    });

    it('still checks once on a reopen, and shows the pointer while it’s pending', async () => {
      const startedAt = new Date(Date.now() - 120 * MINUTE).toISOString();

      const { host } = await showVideo({ jobId: JOB, startedAt });

      expect(statusCheck).toHaveBeenCalledTimes(1);
      expect(host.textContent).toContain(POINTER);

      await settle(MINUTE);
      expect(statusCheck).toHaveBeenCalledTimes(1);
    });

    it('can still play on a reopen, while its status lasts', async () => {
      const startedAt = new Date(Date.now() - 120 * MINUTE).toISOString();
      statusCheck.mockImplementation(async () => completed());

      const { host } = await showVideo({ jobId: JOB, startedAt });

      expect(host.querySelector('video')?.getAttribute('src')).toBe(
        `${VIDEO}#t=0.1`
      );
    });
  });

  describe('with no job', () => {
    it.each([
      ['may still wait', true],
      ['may no longer wait', false],
    ])('shows nothing for a refusal when it %s', async (_name, mayWait) => {
      const { host } = await showVideo({ error: 'No credits.' }, { mayWait });

      expect(host.innerHTML).toBe('');
      expect(statusCheck).not.toHaveBeenCalled();
    });

    it('says it’s rendering while the call runs', async () => {
      const { host } = await showVideo(undefined, { mayWait: true });

      expect(host.textContent).toContain(RENDERING);
      expect(statusCheck).not.toHaveBeenCalled();
    });

    // A stopped call stays in the chat with no result, so a run alone would bring
    // its card back on the old message.
    it('shows nothing once it may no longer wait', async () => {
      const { host } = await showVideo(undefined, { mayWait: false });

      expect(host.innerHTML).toBe('');
    });
  });

  // The render outlives the run that started it.
  it('keeps going with a job after the run ends, and on older messages', async () => {
    const { host } = await showVideo({ jobId: JOB }, { mayWait: false });

    expect(host.textContent).toContain(RENDERING);

    statusCheck.mockImplementation(async () => completed());
    await settle(10 * 1000);

    expect(host.querySelector('video')).not.toBeNull();
  });
});

describe('a video Samy reports', () => {
  const REPORTED = 'https://media.sharek.app/reported.mp4';

  it('plays in that reply', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <ReportedVideo result={{ status: 'completed', url: REPORTED }} />
      );
    });

    expect(host.querySelector('video')?.getAttribute('src')).toBe(
      `${REPORTED}#t=0.1`
    );
  });

  it.each([
    ['no result yet', undefined],
    ['still pending', { status: 'pending' }],
    ['failed', { status: 'failed', error: 'Render failed.' }],
    ['finished with no link', { status: 'completed' }],
    ['finished with a bad link', { status: 'completed', url: '/v.mp4' }],
  ])('shows nothing with %s', async (_name, result) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<ReportedVideo result={result as any} />);
    });

    expect(host.innerHTML).toBe('');
  });
});

describe('whether a message draws a waiting card', () => {
  const calling = (name: string) => ({
    toolCalls: [{ function: { name } }],
  });

  it.each([
    ['generateImageTool', true],
    ['generateVideoTool', true],
    ['videoStatusTool', false],
    ['postsListTool', false],
  ])('%s: %s', (name, expected) => {
    expect(drawsWaitingCard(calling(name))).toBe(expected);
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

  // A video holds no size until its metadata arrives, and it has no card to keep
  // its room by then.
  it('runs when a reported video’s metadata arrives', async () => {
    const chat = document.createElement('div');
    chat.className = 'copilotKitMessages';
    document.body.appendChild(chat);
    Object.defineProperty(chat, 'scrollHeight', { value: 1000 });
    Object.defineProperty(chat, 'clientHeight', { value: 1000 });
    const root = createRoot(chat);
    mounted.push(root);
    await act(async () => {
      root.render(
        <ReportedVideo
          result={{
            status: 'completed',
            url: 'https://media.sharek.app/reported.mp4',
          }}
        />
      );
    });
    chat.scrollTop = 0;

    await act(async () => {
      chat.querySelector('video')!.dispatchEvent(new Event('loadedmetadata'));
    });

    expect(chat.scrollTop).toBe(1000);
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
