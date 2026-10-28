// The laid-out modal shell on small screens (≤1025px, Tailwind `mobile`): the
// column sits 24px from the top and bottom with an 8px gutter, the card has
// 16px padding and corners and keeps Sharek's shadow, a card without a size
// fills the column, the title stops 28px short of the close control, and the
// close control is a 44px box flush in the corner. Full-screen modals take the
// visible screen's height. `removeLayout` modals and modals with their own
// `top` are not shaped by any of it.
import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

// The classes this shell adds at ≤1025px.
const SHELL_CLASSES = [
  'mobile:pt-[24px]',
  'mobile:pb-[24px]',
  'mobile:px-[8px]',
  'mobile:h-dvh',
  'mobile:p-[16px]',
  'mobile:rounded-[16px]',
  'mobile:w-full',
  'mobile:text-[20px]',
  'mobile:pe-[28px]',
  'mobile:end-0',
  'mobile:top-0',
  'mobile:min-w-[44px]',
  'mobile:min-h-[44px]',
];

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
            title: <span data-testid="title">Time Table Slots</span>,
            children: <div data-testid="body" />,
            ...options,
          }}
        />
      </>
    );
  });

  const title = host.querySelector('[data-testid="title"]')
    ?.parentElement as HTMLElement;
  const headerRow = title?.parentElement as HTMLElement;
  const card = headerRow?.parentElement as HTMLElement;
  return {
    host,
    title,
    card,
    column: card?.parentElement as HTMLElement,
    close: headerRow?.querySelector('button') as HTMLButtonElement,
  };
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/);

// The sized width goes through CSS.supports, which the DOM bootstrap does not
// put on the global object.
beforeAll(() => {
  Object.defineProperty(globalThis, 'CSS', {
    value: window.CSS,
    configurable: true,
  });
});

afterAll(() => {
  delete (globalThis as { CSS?: unknown }).CSS;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  document.body.innerHTML = '';
});

describe('the modal shell on small screens', () => {
  it('sets the column 24px from the top and bottom with an 8px gutter', async () => {
    const { column } = await open({});

    expect(classesOf(column)).toEqual(
      expect.arrayContaining([
        'mobile:pt-[24px]',
        'mobile:pb-[24px]',
        'mobile:px-[8px]',
      ])
    );
  });

  it("pads and rounds the card at 16px and keeps Sharek's shadow", async () => {
    const { card } = await open({});

    expect(classesOf(card)).toEqual(
      expect.arrayContaining([
        'mobile:p-[16px]',
        'mobile:rounded-[16px]',
        'shadow-card',
      ])
    );
  });

  it('fills the column with a card that has no size', async () => {
    const { card } = await open({});

    expect(classesOf(card)).toContain('mobile:w-full');
  });

  // The size itself is an inline `min(500px, 100%)`, which happy-dom's style
  // parser drops, so what is asserted is that the card took the sized branch.
  it('keeps a sized card on its own width', async () => {
    const { card } = await open({ size: 500 });

    expect(classesOf(card)).not.toContain('min-w-[min(600px,100%)]');
    expect(classesOf(card)).not.toContain('mobile:w-full');
  });

  it('sets the title at 20px, 28px short of the close control', async () => {
    const { title } = await open({});

    expect(classesOf(title)).toEqual(
      expect.arrayContaining(['mobile:text-[20px]', 'mobile:pe-[28px]'])
    );
  });

  it('draws the close control as a 44px box flush in the corner, keeping its focus ring', async () => {
    const { close } = await open({});

    expect(classesOf(close)).toEqual(
      expect.arrayContaining([
        'mobile:end-0',
        'mobile:top-0',
        'mobile:min-w-[44px]',
        'mobile:min-h-[44px]',
        'mobile:flex',
        'mobile:items-center',
        'mobile:justify-center',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it("sizes a full-screen modal to the visible screen's height", async () => {
    const { column } = await open({ fullScreen: true });

    expect(classesOf(column)).toEqual(
      expect.arrayContaining(['h-screen', 'mobile:h-dvh'])
    );
  });

  it('leaves a modal with its own top to its inline padding', async () => {
    const { column } = await open({ top: 50 });

    expect(column.style.paddingTop).toBe('50px');
    expect(classesOf(column)).not.toContain('mobile:pt-[24px]');
    expect(classesOf(column)).not.toContain('mobile:px-[8px]');
  });

  it.each([
    ['in a column', false],
    ['full screen', true],
  ])(
    'does not shape a modal that removes the layout, %s',
    async (_kind, fullScreen) => {
      const { host } = await open({ removeLayout: true, fullScreen });
      const classes = Array.from(host.querySelectorAll('[class]')).flatMap(
        classesOf
      );

      expect(host.querySelector('[data-testid="body"]')).not.toBeNull();
      expect(classes.filter((c) => SHELL_CLASSES.includes(c))).toEqual([]);
    }
  );
});
