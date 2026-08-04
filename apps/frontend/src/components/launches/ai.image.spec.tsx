import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toast = jest.fn();
const setLocked = jest.fn();
const request = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) => select({ setLocked }),
}));
// The credits pill reads SWR; the count is not what this spec is about.
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: { credits: 0 }, mutate: jest.fn() }),
}));

import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';

const answer = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// What the fetch wrapper actually does with a credit refusal: the interceptor
// raises the limit modal and the request *rejects*. It must not resolve — a
// resolved response is indistinguishable from success to every caller that
// does not inspect one.
const refused = () => Promise.reject(new AlreadyAnsweredError(402));

const mounted: Array<{ unmount: () => void }> = [];

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const type = async (element: HTMLTextAreaElement, value: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  );

// Some actions carry a credit cost after the label ("Regenerate· 1 credit"),
// so an exact match silently finds nothing and clicking it does nothing.
const buttonStarting = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((node) =>
    node.textContent?.trim().startsWith(label)
  );

/** Opens the AI image modal, types a prompt, and presses Generate. */
const generate = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <>
        <ModalManagerInner />
        <AiImage value="" onChange={jest.fn()} />
      </>
    );
  });

  await click(document.querySelector('.bg-ai'));
  await type(
    document.querySelector('textarea') as HTMLTextAreaElement,
    'a pomegranate on a table'
  );
  await click(button('Generate'));
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

// The reported symptom: the image modal showed its own warning toast where the
// limit modal belongs, because the route answered `200 false` instead of a 402.
describe('when the generation is refused for credits', () => {
  beforeEach(() => {
    request.mockImplementation(refused);
  });

  it('says nothing — the limit modal has already spoken', async () => {
    await generate();

    expect(toast).not.toHaveBeenCalled();
  });

  it('returns to the composer with the prompt intact', async () => {
    await generate();

    const field = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(field).toBeTruthy();
    expect(field.value).toBe('a pomegranate on a table');
  });

  it('gives the composer lock back', async () => {
    await generate();

    expect(setLocked).toHaveBeenLastCalledWith(false);
  });
});

// The 402 branch sits directly ahead of the generic error path, which is the
// shape that silently swallows everything else (FR-014).
describe('when the generation fails for anything else', () => {
  it('still surfaces the failure', async () => {
    request.mockResolvedValue(
      answer(500, { message: 'the renderer fell over' })
    );

    await generate();

    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
  });
});

// The credit for the first image was already spent, and `generate()` clears the
// result before it asks. A refused Regenerate must not take the image with it —
// `ai.video`'s failRender holds its result for exactly this reason.
describe('when a Regenerate is refused', () => {
  it('keeps the image the credit already paid for', async () => {
    request.mockResolvedValue(
      answer(200, { id: 'media-1', path: 'https://media/first.png' })
    );
    await generate();

    // On screen, and reachable: the result phase is what offers "Use image".
    expect(button('Use image')).toBeTruthy();

    request.mockImplementation(refused);
    const regenerate = buttonStarting('Regenerate');
    expect(regenerate).toBeTruthy();
    await click(regenerate);
    // The rejection is handled a microtask after the click; asserting before
    // this flush reads the pre-click DOM and passes whatever the code does.
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });

    expect(toast).not.toHaveBeenCalled();
    expect(button('Use image')).toBeTruthy();
    expect(
      document.querySelector('img[src="https://media/first.png"]')
    ).toBeTruthy();
  });
});
