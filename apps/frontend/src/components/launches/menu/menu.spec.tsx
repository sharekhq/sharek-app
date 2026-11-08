import { act } from 'react';
import { createRoot } from 'react-dom/client';

// A channel's menu is `fixed` and placed at its trigger. Inside a parent with
// a `transform`, that parent, not the viewport, is what `fixed` is measured
// from. The channel list's side drawer was one (ui/split.panel.tsx, until spec
// 046 made it a sheet, which has none): in Arabic it started 90px in, so the
// menu painted 90px right of where it was placed, and the right-edge clamp,
// which worked in viewport numbers, pushed it 80px off a 390px screen (walk
// W53, 2026-10-13). happy-dom has no layout, so the menu's box is stubbed from
// its own `left` plus that offset.

// Everything below is scenery: the menu has to mount. Only the calendar's one
// channel is read, and none of it is asserted on.
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/launches/time.table', () => ({
  TimeTable: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  useCalendar: () => ({
    integrations: [
      {
        id: 'channel',
        name: 'BlogChief',
        originalName: 'BlogChief',
        identifier: 'instagram-standalone',
      },
    ],
    reloadCalendarView: () => undefined,
  }),
}));
jest.mock('@gitroom/frontend/components/launches/bot.picture', () => ({
  BotPicture: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/customer.modal', () => ({
  CustomerModal: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/settings.modal', () => ({
  SettingsModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    CustomVariables: () => null,
  })
);
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ extensionId: '' }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/modal.wrapper.component',
  () => ({ ModalWrapperComponent: () => null })
);
jest.mock('@gitroom/react/form/input', () => ({ Input: () => null }));
jest.mock('@gitroom/react/form/button', () => ({ Button: () => null }));

import { Menu } from '@gitroom/frontend/components/launches/menu/menu';

// The walk's phone: 390px wide, the trigger 120px in, the menu 202px wide.
const SCREEN = { width: 390, height: 844 };
const MENU = { width: 202, height: 381 };
// Where the trigger sits on screen.
let triggerLeft = 120;
// How far right the drawer paints a `fixed` child: 90 in Arabic, 0 elsewhere.
let containerLeft = 0;

const menu = () => document.querySelector('.fixed') as HTMLElement;
const paintedRight = () =>
  parseFloat(menu().style.left) + containerLeft + MENU.width;
// The ⋯ itself, the button that opens the menu.
const trigger = () =>
  document.querySelector('button[aria-haspopup="menu"]') as HTMLElement;

const mounted: Array<{ unmount: () => void }> = [];
const size = { width: window.innerWidth, height: window.innerHeight };

const render = async (label?: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <Menu
        canEnable={false}
        canDisable={false}
        canChangeProfilePicture={false}
        canChangeNickName={false}
        refreshChannel={() => () => undefined}
        id="channel"
        mutate={() => undefined}
        onChange={() => undefined}
        label={label}
      />
    );
  });
};
const click = async () => {
  await act(async () => {
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const open = async () => {
  await render();
  await click();
};
const press = async (node: Element, key: string) => {
  await act(async () => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: SCREEN.width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: SCREEN.height,
  });
  // On the prototype, not one element: the menu's box only exists after the
  // click, and the layout effect measures it in the same act.
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('fixed')) {
        return { left: triggerLeft, top: 190, width: 0, height: 22 } as DOMRect;
      }
      const left = parseFloat(this.style.left) + containerLeft;
      const top = parseFloat(this.style.top);
      return {
        left,
        top,
        right: left + MENU.width,
        bottom: top + MENU.height,
        width: MENU.width,
        height: MENU.height,
      } as DOMRect;
    });
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
  triggerLeft = 120;
  containerLeft = 0;
  jest.restoreAllMocks();
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: size.width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: size.height,
  });
});

describe('the channel menu', () => {
  it('stays on screen inside a transformed parent in Arabic', async () => {
    containerLeft = 90;
    await open();

    // 10px from the edge, as the clamp means: 390 - 10.
    expect(paintedRight()).toBe(380);
  });

  it('is clamped against the screen when nothing moves it', async () => {
    triggerLeft = 300;
    await open();

    expect(menu().style.left).toBe('178px');
    expect(paintedRight()).toBe(380);
  });
});

// The trigger was a bare div, so the keyboard couldn't reach it and a reader
// couldn't name it (T042 Look, M2). A native button takes Tab, and Enter and
// Space click it.
describe('the trigger (FR-052)', () => {
  it('is a button named by its label, with the brand focus ring, that says whether its menu is open', async () => {
    await render('Channel menu');
    const button = trigger();

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Channel menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        'coarse:min-w-[44px]',
        'coarse:min-h-[44px]',
      ])
    );
    expect(menu()).toBeNull();

    await click();

    expect(menu()).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    // the menu sits beside the button, never inside it
    expect(button.contains(menu())).toBe(false);

    await click();

    expect(menu()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('has no name of its own without a label', async () => {
    await render();

    expect(trigger().hasAttribute('aria-label')).toBe(false);
  });

  // The menu closed on a click outside only, while the + menu beside it
  // closes on Escape too (walk 2). The channel list opens in SplitPanel's
  // sheet, which closes on an Escape heard on the document (split.panel.tsx),
  // so while the menu is open the Escape is the menu's alone; closed, it is
  // the sheet's.
  it('closes on Escape, hands the focus back to its button, and keeps that Escape to itself', async () => {
    const documentEscape = jest.fn();
    document.addEventListener('keydown', documentEscape);
    await open();
    const button = trigger();
    expect(document.activeElement).not.toBe(button);

    await press(menu(), 'Escape');

    expect(menu()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    expect(documentEscape).not.toHaveBeenCalled();

    await press(button, 'Escape');
    document.removeEventListener('keydown', documentEscape);

    expect(documentEscape).toHaveBeenCalledTimes(1);
  });

  it('stays open on any other key', async () => {
    await open();

    for (const key of ['Enter', 'Tab', 'ArrowDown', 'a']) {
      await press(menu(), key);
    }

    expect(menu()).not.toBeNull();
  });
});
