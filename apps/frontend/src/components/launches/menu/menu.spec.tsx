import { act } from 'react';
import { createRoot } from 'react-dom/client';

// A channel's menu is `fixed` and placed at its trigger. On a phone it opens
// inside the Channels drawer, whose `transform` (ui/split.panel.tsx) makes the
// drawer, not the viewport, what `fixed` is measured from. In Arabic the drawer
// starts 90px in, so the menu paints 90px right of where it was placed, and
// the right-edge clamp, which worked in viewport numbers, pushed it 80px off a
// 390px screen (walk W53, 2026-10-13). happy-dom has no layout, so the menu's
// box is stubbed from its own `left` plus that offset.
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

const mounted: Array<{ unmount: () => void }> = [];
const size = { width: window.innerWidth, height: window.innerHeight };

const open = async () => {
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
      />
    );
  });
  await act(async () => {
    host.firstElementChild!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
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
  it('stays on screen inside the phone drawer in Arabic', async () => {
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
