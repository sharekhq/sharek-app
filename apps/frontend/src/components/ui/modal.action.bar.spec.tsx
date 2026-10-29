// The bar under the AI image and AI video forms reaches the card's edges and
// meets its bottom corners. It gets there with negative margins that restate
// the card's padding, so it has to restate every tier of it: at 1025px and
// below the card pads 16px, and a bar still pulled out by the desktop 32px
// sticks 16px past both sides of the card, 8px past a 390px screen, and the
// modal then scrolls sideways under a finger (spec 044, T071 F-3).
//
// The expected classes are read off the card new-modal renders, so the two
// cannot drift apart again without this failing. Tailwind is not applied
// here; tools/tailwind-emit pins that the small-screen forms emit.
import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { ModalActionBar } from '@gitroom/frontend/components/ui/modal.action.bar';

let closeEveryModal: (() => void) | undefined;
const Opener: FC = () => {
  const { openModal, closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
    openModal({
      title: 'Generate AI Image',
      children: (
        <ModalActionBar>
          <button data-testid="submit" type="button" />
        </ModalActionBar>
      ),
    });
  }, [openModal, closeAll]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const open = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <ModalManagerInner />
        <Opener />
      </>
    );
  });

  const bar = host.querySelector('[data-testid="submit"]')
    ?.parentElement as HTMLElement;
  return {
    card: bar.closest('.shadow-card') as HTMLElement,
    bar,
    fade: bar.previousElementSibling as HTMLElement,
  };
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/);

// Every tier of a `utility-[Npx]` class, as its variant prefix and its value:
// `p-[32px] mobile:p-[16px]` is [['', '32'], ['mobile:', '16']].
const tiers = (el: Element, utility: string) =>
  classesOf(el).flatMap((className) => {
    const match = className.match(
      new RegExp(`^((?:[a-z]+:)*)${utility}-\\[(\\d+)px\\]$`)
    );
    return match ? [[match[1], match[2]] as const] : [];
  });

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  document.body.innerHTML = '';
});

describe('the modal action bar', () => {
  it('pulls out by the card padding at every width, so it ends at the card edges', async () => {
    const { card, bar } = await open();
    const padding = tiers(card, 'p');

    expect(padding.map(([prefix]) => prefix)).toEqual(['', 'mobile:']);
    for (const [prefix, px] of padding) {
      expect(classesOf(bar)).toEqual(
        expect.arrayContaining([
          `${prefix}-mx-[${px}px]`,
          `${prefix}-mb-[${px}px]`,
          `${prefix}px-[${px}px]`,
        ])
      );
    }
  });

  it("rounds its bottom corners with the card's at every width", async () => {
    const { card, bar } = await open();
    const radius = tiers(card, 'rounded');

    expect(radius.map(([prefix]) => prefix)).toEqual(['', 'mobile:']);
    for (const [prefix, px] of radius) {
      expect(classesOf(bar)).toContain(`${prefix}rounded-b-[${px}px]`);
    }
  });

  it('spans its fade across the same width as the bar', async () => {
    const { card, fade } = await open();

    for (const [prefix, px] of tiers(card, 'p')) {
      expect(classesOf(fade)).toContain(`${prefix}inset-x-[-${px}px]`);
    }
  });
});
