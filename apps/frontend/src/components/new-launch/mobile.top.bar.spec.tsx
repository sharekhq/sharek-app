import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The composer's top bar at 1025px and below (spec 044, FR-003 to FR-005):
// back, the post's date, and one Post button. A single way to save runs
// directly; several open a menu, each in the style of its desktop button.
// Post Now opens on a tap here: nothing on a phone depends on hover.

// The interface's words; empty = the English fallbacks.
let words: Record<string, string> = {};
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => words[key] ?? fallback,
}));

import {
  MobileTopBar,
  MobileTopBarAction,
} from '@gitroom/frontend/components/new-launch/mobile.top.bar';

const mounted: Root[] = [];
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  words = {};
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mounted.push(root);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((each) => each.unmount());
  });
  document.body.innerHTML = '';
});

const render = async (element: ReactElement) => {
  await act(async () => {
    root.render(element);
  });
};

const bar = (
  actions: MobileTopBarAction[],
  options: {
    onBack?: () => void;
    disabled?: boolean;
    reasons?: string[];
  } = {}
) => (
  <MobileTopBar
    onBack={options.onBack || jest.fn()}
    actions={actions}
    disabled={!!options.disabled}
    loading={false}
    reasons={options.reasons}
  >
    <span data-date="">28 Oct, 14:30</span>
  </MobileTopBar>
);

const three = (
  over: Partial<Record<string, Partial<MobileTopBarAction>>> = {}
) => {
  const actions: MobileTopBarAction[] = [
    { label: 'Add to calendar', variant: 'primary', onClick: jest.fn() },
    { label: 'Post Now', variant: 'secondary', onClick: jest.fn() },
    { label: 'Save as Draft', variant: 'tertiary', onClick: jest.fn() },
  ];
  return actions.map((action) => ({ ...action, ...over[action.label] }));
};

const buttons = () => Array.from(host.querySelectorAll('button'));
const byText = (text: string) =>
  buttons().find((button) => button.textContent === text);
const post = () => byText(words.post_action ?? 'Post')!;

const click = async (target: Element) => {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const press = async (target: Element, key: string) => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, code: key, bubbles: true })
    );
  });
};

const classes = (element: Element) => element.className.split(' ');

describe('the back button', () => {
  it('is a named 44px button that goes back, its arrow mirrored right to left', async () => {
    const onBack = jest.fn();
    await render(bar(three(), { onBack }));
    const back = host.querySelector('button[aria-label="Back"]')!;

    expect(back.getAttribute('type')).toBe('button');
    expect(classes(back)).toEqual(
      expect.arrayContaining([
        'w-[44px]',
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(back.querySelector('svg')!.getAttribute('class')).toContain(
      'rtl:rotate-180'
    );
    await click(back);

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('a single way to save', () => {
  it('runs from the button itself, with no menu', async () => {
    const onClick = jest.fn();
    await render(bar([{ label: 'Save Set', variant: 'primary', onClick }]));
    const button = byText('Save Set')!;

    expect(button.hasAttribute('aria-haspopup')).toBe(false);
    await click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(buttons()).toHaveLength(2);
  });
});

describe('the Post button', () => {
  it('reads the verb key', async () => {
    words = { post_action: 'انشر' };
    await render(bar(three()));

    expect(post()).toBeTruthy();
  });

  it('is a 44px rounded brand button with a focus ring', async () => {
    await render(bar(three()));

    expect(classes(post())).toEqual(
      expect.arrayContaining([
        'h-[44px]',
        'rounded-[8px]',
        'bg-brand',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('says it opens a menu, and whether it is open', async () => {
    await render(bar(three()));

    expect(post().getAttribute('aria-haspopup')).toBe('true');
    expect(post().getAttribute('aria-expanded')).toBe('false');
    await click(post());

    expect(post().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens nothing while disabled', async () => {
    await render(bar(three(), { disabled: true }));

    expect(post().disabled).toBe(true);
    await click(post());

    expect(byText('Post Now')).toBeUndefined();
  });
});

describe('the Post menu', () => {
  const open = async (
    actions = three(),
    options: { reasons?: string[] } = {}
  ) => {
    await render(bar(actions, options));
    await click(post());
  };

  it('lists Add to calendar, Post Now and Save as Draft, in that order', async () => {
    await open();

    expect(buttons().map((button) => button.textContent)).toEqual([
      '',
      'Post',
      'Add to calendar',
      'Post Now',
      'Save as Draft',
    ]);
  });

  it('draws each in the style of its desktop button, 44px tall and rounded', async () => {
    await open();
    const common = ['h-[44px]', 'rounded-[8px]', 'focus-visible:ring-brand'];

    expect(classes(byText('Add to calendar')!)).toEqual(
      expect.arrayContaining([...common, 'bg-brand', 'text-white'])
    );
    expect(classes(byText('Post Now')!)).toEqual(
      expect.arrayContaining([
        ...common,
        'bg-surface',
        'border',
        'border-brandText',
        'text-brandText',
      ])
    );
    expect(classes(byText('Save as Draft')!)).toEqual(
      expect.arrayContaining([...common, 'bg-btnSimple'])
    );
  });

  it('runs the action tapped and closes', async () => {
    const actions = three();
    await open(actions);

    await click(byText('Post Now')!);

    expect(actions[1].onClick).toHaveBeenCalledTimes(1);
    expect(byText('Post Now')).toBeUndefined();
  });

  it('keeps a disabled action from running', async () => {
    const actions = three({ 'Post Now': { disabled: true } });
    await open(actions);

    expect(byText('Post Now')!.disabled).toBe(true);
    await click(byText('Post Now')!);

    expect(actions[1].onClick).not.toHaveBeenCalled();
  });

  // A tooltip cannot be read on touch, so the reasons are text in the menu.
  it('shows why publishing is blocked as text under the blocked actions', async () => {
    await open(
      three({
        'Add to calendar': { disabled: true },
        'Post Now': { disabled: true },
      }),
      {
        reasons: [
          'TikTok (Tom & Jerry): pick who can see it',
          'TikTok (Acme): turn on the disclosure',
        ],
      }
    );
    const reasons = Array.from(host.querySelectorAll('div')).find((node) =>
      classes(node).includes('whitespace-pre-line')
    )!;

    expect(reasons.textContent).toBe(
      'TikTok (Tom & Jerry): pick who can see it\nTikTok (Acme): turn on the disclosure'
    );
    expect(classes(reasons)).toContain('text-muted');
    expect(reasons.previousElementSibling!.textContent).toBe('Post Now');
    expect(reasons.nextElementSibling!.textContent).toBe('Save as Draft');
  });

  it('closes on a tap outside it', async () => {
    await open();

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true })
      );
    });

    expect(byText('Post Now')).toBeUndefined();
  });

  // The composer behind is a modal whose own Escape asks to close the post.
  // It listens on the node React listens on, modelled here on React's root.
  it('closes on Escape, gives the focus back to Post, and the composer never hears the key', async () => {
    const composerEscape = jest.fn();
    host.addEventListener('keydown', composerEscape);
    await open();

    await press(byText('Post Now')!, 'Escape');

    expect(byText('Post Now')).toBeUndefined();
    expect(document.activeElement).toBe(post());
    expect(composerEscape).not.toHaveBeenCalled();
  });

  it('leaves Escape to the composer while closed', async () => {
    const composerEscape = jest.fn();
    host.addEventListener('keydown', composerEscape);
    await render(bar(three()));

    await press(post(), 'Escape');

    expect(composerEscape).toHaveBeenCalledTimes(1);
  });
});
