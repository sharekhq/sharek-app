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
// channel is read: its fields and the four flags choose the menu's rows, which
// the items table at the end pins.
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
const mockOpenModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: mockOpenModal }),
}));
jest.mock('@gitroom/frontend/components/launches/time.table', () => ({
  TimeTable: () => null,
}));
// The channel as GET /integrations/list sends it, which sends
// `additionalSettings` as '[]' when the channel has none. A case sets its own.
const CHANNEL = {
  id: 'channel',
  name: 'BlogChief',
  originalName: 'BlogChief',
  identifier: 'instagram-standalone',
  additionalSettings: '[]',
};
let mockChannel: Record<string, unknown> = CHANNEL;
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  useCalendar: () => ({
    integrations: [mockChannel],
    reloadCalendarView: () => undefined,
  }),
}));
jest.mock('@gitroom/frontend/components/launches/bot.picture', () => ({
  BotPicture: () => null,
}));
// Move to brand's list (brands/brand.menu.tsx), its own spec's: here only what
// the menu hands it, its last props and what the menu asks of its handle.
const mockMove = {
  props: {} as Record<string, unknown>,
  open: jest.fn(),
  close: jest.fn(),
};
jest.mock('@gitroom/frontend/components/brands/brand.menu', () => {
  const { forwardRef, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  return {
    MoveToBrandMenu: forwardRef((props: Record<string, unknown>, handle) => {
      mockMove.props = props;
      useImperativeHandle(handle, () => ({
        open: mockMove.open,
        close: mockMove.close,
      }));
      return <i data-testid="move-to-brand" />;
    }),
  };
});
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
import {
  MENU_ICON,
  MENU_ICON_DANGER,
  MENU_ITEM,
  MENU_PANEL,
} from '@gitroom/frontend/components/launches/post.actions.menu';

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

// The four flags the channel list passes, all off unless a case sets one: a
// disabled channel at the plan's limit, with no bot picture or nickname.
const NO_FLAGS = {
  canEnable: false,
  canDisable: false,
  canChangeProfilePicture: false,
  canChangeNickName: false,
};
type Flags = Partial<typeof NO_FLAGS>;

const render = async (label?: string, flags: Flags = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <Menu
        {...NO_FLAGS}
        {...flags}
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
const open = async (flags?: Flags) => {
  await render(undefined, flags);
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
  mockChannel = CHANNEL;
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

  it('closes on an Escape pressed on its ⋯, where the keyboard leaves the focus', async () => {
    const documentEscape = jest.fn();
    document.addEventListener('keydown', documentEscape);
    await open();
    const button = trigger();
    button.focus();

    await press(button, 'Escape');
    document.removeEventListener('keydown', documentEscape);

    expect(menu()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    expect(documentEscape).not.toHaveBeenCalled();
  });

  // The menu stays open behind the Disable and Delete confirmations and the
  // Custom URL modal, each of which closes on its own Escape, and the focus
  // can be anywhere else on the page (code review). An Escape pressed outside
  // the menu and its ⋯ isn't the menu's.
  it('lets an Escape pressed outside it pass, and stays open', async () => {
    const documentEscape = jest.fn();
    document.addEventListener('keydown', documentEscape);
    await open();
    const button = trigger();
    // stands in for a confirmation or a modal's field over the menu
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();

    await press(field, 'Escape');
    document.removeEventListener('keydown', documentEscape);

    expect(menu()).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(documentEscape).toHaveBeenCalledTimes(1);
  });
});

// Which rows the menu shows, in which order, for each state a channel can be
// in, as on main at 5be5e781c. Spec 058 restyles the menu and hands its Move /
// add to group to a brand list, and keeps every row, its order and its
// condition, so this table stays as it is.
const rows = () => Array.from(menu().children).map((row) => row.textContent);
// A channel signed in with fields of its own (dev.to's API key), not OAuth.
const CREDENTIALS = {
  isCustomFields: true,
  customFields: [
    {
      key: 'apiKey',
      label: 'API key',
      validation: '/^.{3,}$/',
      type: 'password',
    },
  ],
};

describe('the channel menu items, by channel state (SC-008)', () => {
  it.each<{
    state: string;
    flags: Flags;
    channel?: Record<string, unknown>;
    labels: string[];
  }>([
    {
      state: 'an enabled channel',
      flags: { canDisable: true },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'a disabled channel with room on the plan',
      flags: { canEnable: true },
      labels: [
        'Copy Channel ID',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Enable Channel',
        'Delete',
      ],
    },
    {
      state: "a disabled channel at the plan's limit",
      flags: {},
      labels: [
        'Copy Channel ID',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Delete',
      ],
    },
    {
      state: 'an enabled channel that needs reconnecting',
      flags: { canDisable: true },
      channel: { refreshNeeded: true },
      labels: [
        'Copy Channel ID',
        'Reconnect channel',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'an enabled channel with credentials that needs reconnecting',
      flags: { canDisable: true },
      channel: { refreshNeeded: true, ...CREDENTIALS },
      labels: [
        'Copy Channel ID',
        'Update Credentials',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'an enabled channel with credentials',
      flags: { canDisable: true },
      channel: CREDENTIALS,
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Update Credentials',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'an enabled channel with no additional settings',
      flags: { canDisable: true },
      channel: { additionalSettings: '[]' },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'an enabled channel with additional settings',
      flags: { canDisable: true },
      // X's, as x.provider.ts sends them
      channel: {
        additionalSettings: JSON.stringify([
          {
            title: 'Verified',
            description: 'Is this a verified user? (Premium)',
            type: 'checkbox',
            value: false,
          },
        ]),
      },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Additional Settings',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'a bot that can change its picture',
      flags: { canDisable: true, canChangeProfilePicture: true },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Change Bot Picture',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'a bot that can change its nickname',
      flags: { canDisable: true, canChangeNickName: true },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Change Bot Nickname',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'a bot that can change both',
      flags: {
        canDisable: true,
        canChangeProfilePicture: true,
        canChangeNickName: true,
      },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Change Bot Picture / Nickname',
        'Rename channel',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
    {
      state: 'a renamed channel',
      flags: { canDisable: true },
      channel: { name: 'BlogChief News' },
      labels: [
        'Create a new post',
        'Copy Channel ID',
        'Rename channel',
        'Reset to original name',
        'Move / add to group',
        'Edit Time Slots',
        'Disable Channel',
        'Delete',
      ],
    },
  ])('$state', async ({ flags, channel, labels }) => {
    mockChannel = { ...CHANNEL, ...channel };
    await open(flags);

    expect(rows()).toEqual(labels);
  });
});

// The look of Samy's chat menu, which every ⋯ list in the app shares
// (post.actions.menu.tsx): the panel, each row and each row's icon box take it
// by name, and the icons draw in the box's colour. All four flags are on, which
// no channel is at once, so that as many rows show as can: Create a new post
// shows only while the channel needs no reconnecting and Reconnect channel only
// while it does, so the two states between them show all 13.
const classes = (node: Element) => node.className.split(' ').sort();
const look = (name: string) => name.split(' ').sort();
const EVERY_FLAG: Flags = {
  canEnable: true,
  canDisable: true,
  canChangeProfilePicture: true,
  canChangeNickName: true,
};
const EVERY_ROW = {
  name: 'BlogChief News',
  additionalSettings: JSON.stringify([
    { title: 'Verified', type: 'checkbox', value: false },
  ]),
};

describe.each([
  {
    state: 'with Create a new post',
    channel: { ...EVERY_ROW, ...CREDENTIALS },
    count: 12,
  },
  {
    state: 'with Reconnect channel',
    channel: { ...EVERY_ROW, refreshNeeded: true },
    count: 11,
  },
])('the channel menu look (FR-001), $state', ({ channel, count }) => {
  const shown = () => Array.from(menu().children);

  beforeEach(async () => {
    mockChannel = { ...CHANNEL, ...channel };
    await open(EVERY_FLAG);
    expect(shown()).toHaveLength(count);
  });

  it('draws its panel in MENU_PANEL alone', () => {
    expect(classes(menu())).toEqual(look(MENU_PANEL));
  });

  it('draws every row in MENU_ITEM alone', () => {
    for (const row of shown()) {
      expect(classes(row)).toEqual(look(MENU_ITEM));
    }
  });

  it("boxes every row's icon in MENU_ICON, and Delete's in MENU_ICON_DANGER", () => {
    for (const row of shown()) {
      expect(classes(row.children[0])).toEqual(
        look(row.textContent === 'Delete' ? MENU_ICON_DANGER : MENU_ICON)
      );
    }
  });

  it('paints no icon green or yellow', () => {
    expect(
      menu().querySelectorAll('[fill="green"], [fill="yellow"]')
    ).toHaveLength(0);
  });

  it('keeps its labels at 14px', () => {
    for (const row of shown()) {
      expect(row.children[1].className).toBe('text-[14px]');
    }
  });
});

// Move to brand opened a window with a datalist whose dropdown didn't work
// (customer.modal.tsx). It now closes the ⋯ list and opens the brand list
// held over the ⋯ (MoveToBrandMenu), which hangs from the ⋯ and hands the
// focus back to it.
describe('Move to brand (FR-006, FR-010, FR-013, FR-014)', () => {
  const marker = () => document.querySelector('[data-testid="move-to-brand"]');
  const moveRow = () =>
    Array.from(menu().children).find(
      (row) => row.textContent === 'Move / add to group'
    ) as HTMLElement;

  beforeEach(() => {
    mockOpenModal.mockClear();
    mockMove.open.mockClear();
    mockMove.close.mockClear();
  });

  it("holds the brand list in the ⋯'s box, after the ⋯, for the calendar's channel", async () => {
    await render();
    const button = trigger();

    expect(marker()).not.toBeNull();
    expect(marker()?.parentElement).toBe(button.parentElement);
    expect(
      button.compareDocumentPosition(marker() as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(mockMove.props.channel).toBe(mockChannel);
    expect(
      (mockMove.props.button as { current: HTMLElement | null }).current
    ).toBe(button);
  });

  it('closes the ⋯ list and opens the brand list, with no window', async () => {
    await open({ canDisable: true });

    await act(async () => {
      moveRow().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(menu()).toBeNull();
    expect(mockMove.open).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).not.toHaveBeenCalled();
  });
});
