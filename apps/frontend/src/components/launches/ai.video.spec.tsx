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
  useLaunchStore: (select: (state: any) => any) =>
    select({ setLocked, setActivateExitButton: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { current: 'STANDARD' }, role: 'ADMIN' }),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: { credits: 0 }, mutate: jest.fn() }),
}));
// The provider registry drags in every video provider; this spec only needs a
// type that leaves the action bar — and therefore the Generate button — to the
// modal.
jest.mock(
  '@gitroom/frontend/components/videos/video.render.component',
  () => ({
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoTypeCard: () => undefined,
  })
);

import { Modal } from '@gitroom/frontend/components/launches/ai.video';

const answer = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  body: null,
});

const mounted: Array<{ unmount: () => void }> = [];

const posted = (url: string) =>
  request.mock.calls.filter(([called]) => called === url);

const generate = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <Modal
        type={{ identifier: 'veo3', title: 'Veo3' }}
        close={jest.fn()}
        setLoading={jest.fn()}
        onChange={jest.fn()}
      />
    );
  });

  const submit = Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === 'Generate'
  );

  await act(async () => {
    submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // handleSubmit resolves on a microtask after the click.
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

// The pre-flight exists so a refusal lands before the waiting screen does. Its
// answer was being thrown away, so the render call went out regardless — and
// refused a second time, raising the modal twice (FR-012).
describe('when the pre-flight refuses', () => {
  beforeEach(() => {
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(402, { statusCode: 402, section: 'videos_per_month' })
          : answer(200, {})
      )
    );
  });

  it('never asks for the render', async () => {
    await generate();

    expect(posted('/media/generate-video/veo3/allowed')).toHaveLength(1);
    expect(posted('/media/generate-video')).toHaveLength(0);
  });

  it('says nothing of its own — the limit modal has already spoken', async () => {
    await generate();

    expect(toast).not.toHaveBeenCalled();
  });
});

describe('when the render itself is refused', () => {
  it('resets without a second message', async () => {
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(200, true)
          : answer(402, { statusCode: 402, section: 'videos_per_month' })
      )
    );

    await generate();

    expect(toast).not.toHaveBeenCalled();
  });
});

// The 402 branch sits directly ahead of the generic error path, which is the
// shape that silently swallows everything else (FR-014).
describe('when the render fails for anything else', () => {
  it('still surfaces the failure', async () => {
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(200, true)
          : answer(500, { message: 'the renderer fell over' })
      )
    );

    await generate();

    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
  });
});
