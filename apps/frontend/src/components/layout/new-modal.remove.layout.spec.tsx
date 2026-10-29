import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

// Spec 044: a full-screen modal with no layout of its own scrolls like a page
// at 1025px and below, as upstream's phone composer needs, so the content can
// run past the screen under a sticky bar. Upstream ships the three classes on
// the modal manager's path, so every full-screen removeLayout modal takes them
// (onboarding, the add-channel forms), not only the composer. The content here
// is not the composer, to pin exactly that.

let closeEveryModal: (() => void) | undefined;

const Open: FC<{ fullScreen: boolean }> = ({ fullScreen }) => {
  const { openModal, closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
    openModal({
      removeLayout: true,
      fullScreen,
      children: <div data-testid="content">Onboarding</div>,
    });
  }, [openModal, closeAll, fullScreen]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

// The modal's four boxes, from the overlay in to the column around the content.
const open = async (fullScreen: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <ModalManagerInner />
        <Open fullScreen={fullScreen} />
      </>
    );
  });
  const column = document.querySelector('[data-testid="content"]')!
    .parentElement!;
  const firstChild = column.parentElement!.parentElement!;
  return { overlay: firstChild.parentElement!, firstChild, column };
};

const classes = (element: Element) => element.className.split(' ');

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  document.body.innerHTML = '';
});

describe('a full-screen modal with no layout of its own', () => {
  it('scrolls as a page at 1025px and below', async () => {
    const { overlay, firstChild, column } = await open(true);

    expect(classes(overlay)).toContain('mobile:block');
    expect(classes(firstChild)).toContain('mobile:min-h-full');
    expect(classes(column)).toContain('mobile:h-auto');
  });

  // Sharek's floor fix holds at every width: each box is a flex item, and
  // without min-w-0 the content's width would push the overlay off the screen.
  it('keeps min-w-0 on the boxes at every width', async () => {
    const { firstChild, column } = await open(true);

    expect(classes(firstChild)).toContain('min-w-0');
    expect(classes(column.parentElement!)).toContain('min-w-0');
    expect(classes(column)).toContain('min-w-0');
  });
});

describe('a modal with no layout of its own that is not full screen', () => {
  it('takes none of the page-scroll classes', async () => {
    const { overlay } = await open(false);
    const all = [overlay, ...Array.from(overlay.querySelectorAll('*'))]
      .flatMap(classes)
      .filter(Boolean);

    expect(all).not.toContain('mobile:block');
    expect(all).not.toContain('mobile:min-h-full');
    expect(all).not.toContain('mobile:h-auto');
  });
});
