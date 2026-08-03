import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

import {
  ModalHeaderSlot,
  ModalHeaderSlotTarget,
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

/**
 * The bug this covers: both AI modals used to portal their credits pill into
 * `document.querySelector('.top-title-content')`, and the modal manager renders
 * its modals in open order, so the selector always returned the *first* modal's
 * header. Opening the AI image modal from inside the video modal put the image
 * modal's pill in the video modal's title.
 */

let closeEveryModal: (() => void) | undefined;
const CaptureModals: FC = () => {
  const { closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
  }, [closeAll]);
  return null;
};

const Stack: FC<{ withTargets: boolean }> = ({ withTargets }) => {
  const { openModal } = useModals();
  useEffect(() => {
    (['a', 'b'] as const).forEach((name) => {
      openModal({
        title: (
          <div data-testid={`header-${name}`}>
            {withTargets && <ModalHeaderSlotTarget />}
          </div>
        ),
        children: (
          <ModalHeaderSlot>
            <span data-testid={`pill-${name}`}>{name}</span>
          </ModalHeaderSlot>
        ),
      });
    });
  }, [openModal, withTargets]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const open = async (withTargets = true) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <>
        <CaptureModals />
        <ModalManagerInner />
        <Stack withTargets={withTargets} />
      </>
    );
  });
  // The slot is a callback ref, so the portal only has somewhere to go on the
  // render after the header mounts.
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });

  return (name: string) =>
    document.querySelector(`[data-testid="header-${name}"]`);
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  document.body.innerHTML = '';
});

describe('modal header slot', () => {
  it('fills the header of the modal the content belongs to', async () => {
    const header = await open();

    expect(header('a')?.querySelector('[data-testid="pill-a"]')).toBeTruthy();
    expect(header('b')?.querySelector('[data-testid="pill-b"]')).toBeTruthy();
  });

  it('keeps a stacked modal out of the header underneath it', async () => {
    const header = await open();

    expect(header('a')?.querySelector('[data-testid="pill-b"]')).toBeNull();
    expect(header('b')?.querySelector('[data-testid="pill-a"]')).toBeNull();
  });

  it('renders nothing when the title declares no slot', async () => {
    const header = await open(false);

    expect(header('a')?.textContent).toBe('');
    expect(document.querySelector('[data-testid="pill-a"]')).toBeNull();
  });
});
