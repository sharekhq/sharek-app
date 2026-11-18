// The composer window: a modal opened with `composerWindow` is, from 1026px,
// a window over the whole app. The overlay blurs what is behind it (the dim is
// the overlay's own bg-popup), the wrapper keeps 12px from every edge and caps
// at 1600px, centred. `fullScreen` alone changes none of that.
import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

type Options = Parameters<ReturnType<typeof useModals>['openModal']>[0];

let closeEveryModal: (() => void) | undefined;
const Opener: FC<{ options: Options }> = ({ options }) => {
  const { openModal, closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
    openModal(options);
  }, [openModal, closeAll, options]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const open = async (options: Partial<Options>) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <ModalManagerInner />
        <Opener
          options={{
            children: <div data-testid="body" />,
            removeLayout: true,
            fullScreen: true,
            ...options,
          }}
        />
      </>
    );
  });
  const body = host.querySelector('[data-testid="body"]') as HTMLElement;
  const card = body.parentElement as HTMLElement;
  const wrapper = card.parentElement as HTMLElement;
  const overlay = wrapper.parentElement?.parentElement as HTMLElement;
  return { overlay, wrapper };
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/);
const FROM_LAPTOP = '[@media(min-width:1026px)]:';

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  document.body.innerHTML = '';
});

describe('the composer window', () => {
  it('composerWindow adds the blur and 12px padding from 1026px', async () => {
    const { overlay, wrapper } = await open({ composerWindow: true });
    expect(classesOf(overlay)).toContain(`${FROM_LAPTOP}backdrop-blur-[8px]`);
    expect(classesOf(wrapper)).toEqual(
      expect.arrayContaining([
        `${FROM_LAPTOP}p-[12px]`,
        `${FROM_LAPTOP}max-w-[1600px]`,
        `${FROM_LAPTOP}mx-auto`,
      ])
    );
  });

  it('fullScreen alone does not', async () => {
    const { overlay, wrapper } = await open({});
    expect(classesOf(overlay)).not.toContain(
      `${FROM_LAPTOP}backdrop-blur-[8px]`
    );
    expect(classesOf(wrapper)).not.toContain(`${FROM_LAPTOP}p-[12px]`);
  });
});
