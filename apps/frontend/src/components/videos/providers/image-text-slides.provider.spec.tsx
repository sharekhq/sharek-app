import { FC, act } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

const toast = jest.fn();
const request = jest.fn();
const startRender = jest.fn();
const onMedia = jest.fn();
const failRender = jest.fn();
// The window's one render at a time: it says whether this provider may start
// one. Free unless a case says otherwise.
const claimRender = jest.fn(() => true);
// The modal's action bar, which the provider fills through a portal.
let actionsSlot: HTMLDivElement | null = null;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/frontend/components/videos/video.context.wrapper', () => ({
  useVideo: () => ({
    output: 'vertical',
    actionsSlot,
    onMedia,
    startRender,
    reportProgress: jest.fn(),
    failRender,
    claimRender,
    phase: 'setup',
    setTrail: jest.fn(),
  }),
}));
jest.mock('@gitroom/frontend/components/videos/video.modal.parts', () => ({
  VideoPromptField: () => null,
}));
// The registry drags in every video provider; the voice list is all this one
// reads from it, and its contents are not what this spec is about.
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => ({
  useVideoFunction: () => jest.fn(),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: { voices: [] }, isLoading: false }),
}));

import { videosList } from '@gitroom/frontend/components/videos/video.wrapper';
import '@gitroom/frontend/components/videos/providers/image-text-slides.provider';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';

const Slides = videosList.find(
  (p) => p.identifier === 'image-text-slides'
)!.Component;

const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** The NDJSON body the create route answers with, as `ndjsonFrames` reads it. */
const stream = (...frames: object[]) => {
  const chunks = frames.map((frame) =>
    new TextEncoder().encode(JSON.stringify(frame) + '\n')
  );
  let next = 0;
  return {
    getReader: () => ({
      read: async () =>
        next < chunks.length
          ? { done: false, value: chunks[next++] }
          : { done: true, value: undefined },
      cancel: async (): Promise<void> => undefined,
    }),
  } as unknown as ReadableStream<Uint8Array>;
};

const storyboard = {
  styleGuide: 'warm studio light',
  slides: [{ text: 'Fresh bread every morning' }, { text: 'Open until ten' }],
};

const finished = { id: 'media-1', path: 'https://media/slides.mp4' };

const rendered = () => ({
  ...answer(200, {}),
  body: stream({ name: 'done', media: finished }),
});

const mounted: Array<{ unmount: () => void }> = [];

/** Flushes the microtasks an awaited fetch resolves on. */
const settle = async () => {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Create video carries its cost after the label ("Create video· 1 credit").
const buttonStarting = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((node) =>
    node.textContent?.trim().startsWith(label)
  );

const created = () =>
  request.mock.calls.filter(
    ([called]) => called === '/media/generate-video/create'
  );

/**
 * Renders the provider in a form, with the bar its actions are portalled into,
 * and plans a script so the review screen and its Create video are showing.
 * Every create answers with `create`.
 */
const review = async (create: () => Promise<unknown>) => {
  request.mockImplementation((url: string) => {
    if (url.endsWith('/allowed')) {
      return Promise.resolve(answer(200, true));
    }
    if (url === '/media/generate-video/plan') {
      return Promise.resolve(answer(200, storyboard));
    }
    return create();
  });

  actionsSlot = document.createElement('div');
  document.body.appendChild(actionsSlot);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  const Harness: FC = () => {
    const methods = useForm();
    return (
      <FormProvider {...methods}>
        <Slides />
      </FormProvider>
    );
  };

  await act(async () => {
    root.render(<Harness />);
  });
  await click(buttonStarting('Continue'));
  await settle();
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  actionsSlot = null;
  jest.clearAllMocks();
});

// Create video and Regenerate stay on screen until the create route answers,
// so a second click there started a second render and a second charge. The
// window holds one render at a time; the provider has to ask it first.
describe('the render it starts', () => {
  it('is claimed once from the window for Create video', async () => {
    await review(() => Promise.resolve(rendered()));

    await click(buttonStarting('Create video'));
    await settle();

    expect(claimRender).toHaveBeenCalledTimes(1);
    expect(created()).toHaveLength(1);
  });

  it('creates nothing while the window holds another', async () => {
    await review(() => Promise.resolve(rendered()));
    claimRender.mockReturnValueOnce(false);

    await click(buttonStarting('Create video'));
    await settle();

    expect(created()).toHaveLength(0);
  });

  it('is claimed again for a Regenerate', async () => {
    await review(() => Promise.resolve(rendered()));
    await click(buttonStarting('Create video'));
    await settle();
    claimRender.mockReturnValueOnce(false);
    const { regenerate } = startRender.mock.calls[0][0];

    await act(async () => {
      regenerate();
    });
    await settle();

    expect(created()).toHaveLength(1);
  });

  // The window lets the claim go when the render is handed back, so every way
  // a create can end has to hand it back.
  it('is handed back when the create is refused', async () => {
    await review(() => Promise.reject(new AlreadyAnsweredError(402)));

    await click(buttonStarting('Create video'));
    await settle();

    expect(failRender).toHaveBeenCalledTimes(1);
  });
});
