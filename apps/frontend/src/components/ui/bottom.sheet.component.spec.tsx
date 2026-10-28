import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The composer's sheets on small screens (spec 044, FR-008), shared with the
// calendar's (spec 046). A sheet is a modal dialog over the composer: it takes
// the focus and keeps it, Escape closes the sheet alone, and the page behind it
// stays still.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import {
  BottomSheet,
  BottomSheetButton,
  BottomSheetRow,
} from '@gitroom/frontend/components/ui/bottom.sheet.component';

const mounted: Root[] = [];
let host: HTMLElement;
let root: Root;

beforeEach(() => {
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
  document.body.className = '';
  document.body.style.overflow = '';
});

const render = async (element: ReactElement) => {
  await act(async () => {
    root.render(element);
  });
};

const sheet = (
  onClose = jest.fn(),
  button?: { label: string; onClick: () => void; disabled?: boolean }
) => (
  <BottomSheet title="Select Channels" onClose={onClose} button={button}>
    <input aria-label="Search" />
    <button type="button">Sharek Café</button>
  </BottomSheet>
);

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;

const press = async (
  target: Element,
  key: string,
  options: KeyboardEventInit = {}
) => {
  const event = new KeyboardEvent('keydown', {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
};

const click = async (target: Element) => {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('a bottom sheet', () => {
  it('is a modal dialog named by its title', async () => {
    await render(sheet());

    expect(dialog().getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(
      dialog().getAttribute('aria-labelledby')!
    );
    expect(title?.textContent).toBe('Select Channels');
  });

  // The composer is a modal too, and its Escape asks before closing the post.
  // In the app React's listener and that one both sit on the document (Next
  // hydrates the document), so the composer's listener is modelled here on
  // React's own root, added after it as the composer's is.
  it('closes on Escape, and the composer behind it never hears the key', async () => {
    const composerEscape = jest.fn();
    const documentEscape = jest.fn();
    host.addEventListener('keydown', composerEscape);
    document.addEventListener('keydown', documentEscape);
    const onClose = jest.fn();
    await render(sheet(onClose));

    await press(document.querySelector('input')!, 'Escape');
    document.removeEventListener('keydown', documentEscape);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(composerEscape).not.toHaveBeenCalled();
    expect(documentEscape).not.toHaveBeenCalled();
  });

  it('closes on a tap on the scrim', async () => {
    const onClose = jest.fn();
    await render(sheet(onClose));

    await click(dialog().previousElementSibling!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on its cross, a named 44px button with a focus ring', async () => {
    const onClose = jest.fn();
    await render(sheet(onClose));
    const cross = dialog().querySelector<HTMLButtonElement>(
      'button[aria-label="Close"]'
    )!;

    expect(cross.getAttribute('type')).toBe('button');
    expect(cross.className.split(' ')).toEqual(
      expect.arrayContaining([
        'w-[44px]',
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    await click(cross);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the page while open, for the support chat bubble to hide', async () => {
    await render(sheet());

    expect(document.body.classList.contains('bottomSheetOpen')).toBe(true);

    await act(async () => root.render(<></>));

    expect(document.body.classList.contains('bottomSheetOpen')).toBe(false);
  });

  // What scrolls behind a sheet is the composer's full-screen overlay
  // (new-modal's removeLayout path, overflow-y auto), not the body, which the
  // modal manager already holds still.
  it('stops the scroller it sits in while open, and gives it back', async () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    host.replaceWith(scroller);
    scroller.appendChild(host);

    await render(sheet());

    expect(scroller.style.overflowY).toBe('hidden');

    await act(async () => root.render(<></>));

    expect(scroller.style.overflowY).toBe('auto');
  });

  it('takes the focus when it opens and gives it back when it closes', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    await render(sheet());

    expect(document.activeElement).toBe(dialog());
    expect(dialog().getAttribute('tabindex')).toBe('-1');

    await act(async () => root.render(<></>));

    expect(document.activeElement).toBe(opener);
  });

  describe('keeps Tab inside', () => {
    const controls = () =>
      Array.from(
        dialog().querySelectorAll<HTMLElement>('button:not([disabled]), input')
      );

    it('from the last control forward to the first', async () => {
      await render(sheet(jest.fn(), { label: 'Done', onClick: jest.fn() }));
      const [first, last] = [controls()[0], controls().at(-1)!];
      last.focus();

      const event = await press(last, 'Tab');

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it('from the first control back to the last', async () => {
      await render(sheet(jest.fn(), { label: 'Done', onClick: jest.fn() }));
      const [first, last] = [controls()[0], controls().at(-1)!];
      first.focus();

      const event = await press(first, 'Tab', { shiftKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });

    it('from the sheet itself back to the last control', async () => {
      await render(sheet(jest.fn(), { label: 'Done', onClick: jest.fn() }));

      await press(dialog(), 'Tab', { shiftKey: true });

      expect(document.activeElement).toBe(controls().at(-1));
    });

    // A locked composer disables a sheet's rows through a disabled fieldset:
    // the cross is then the only stop, and Tab must not leave through them.
    it('around the one control a locked sheet leaves enabled', async () => {
      await render(
        <BottomSheet title="Settings" onClose={jest.fn()}>
          <fieldset disabled>
            <button type="button">Add Tag</button>
            <button type="button">Repeat Post</button>
          </fieldset>
        </BottomSheet>
      );
      const cross = dialog().querySelector<HTMLElement>(
        'button[aria-label="Close"]'
      )!;
      cross.focus();

      const forward = await press(cross, 'Tab');
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(cross);

      const back = await press(cross, 'Tab', { shiftKey: true });
      expect(back.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(cross);
    });

    it('leaves Tab alone between two controls', async () => {
      await render(sheet());
      const first = controls()[0];
      first.focus();

      const event = await press(first, 'Tab');

      expect(event.defaultPrevented).toBe(false);
    });
  });

  it('runs its main action from a 44px brand button', async () => {
    const onClick = jest.fn();
    await render(sheet(jest.fn(), { label: 'Done', onClick }));
    const done = Array.from(dialog().querySelectorAll('button')).find(
      (button) => button.textContent === 'Done'
    )!;

    expect(done.className.split(' ')).toEqual(
      expect.arrayContaining(['bg-brand', 'h-[44px]', 'rounded-[8px]'])
    );
    await click(done);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('greys its main action out and keeps it from running while disabled', async () => {
    const onClick = jest.fn();
    await render(sheet(jest.fn(), { label: 'Done', onClick, disabled: true }));
    const done = Array.from(dialog().querySelectorAll('button')).find(
      (button) => button.textContent === 'Done'
    )!;

    expect(done.disabled).toBe(true);
    expect(done.className.split(' ')).toEqual(
      expect.arrayContaining(['disabled:bg-btnSimple', 'disabled:text-muted'])
    );
    await click(done);

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('a bottom sheet button on its own', () => {
  it('is a real button with a focus ring', async () => {
    await render(<BottomSheetButton label="Save" onClick={jest.fn()} />);
    const button = host.querySelector('button')!;

    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('focus-visible:ring-brand');
  });
});

describe('a bottom sheet row', () => {
  it('is a 44px button that runs its action, its chevron mirrored right to left', async () => {
    const onClick = jest.fn();
    await render(
      <BottomSheetRow icon={<i />} label="Add Tag" onClick={onClick} />
    );
    const row = host.querySelector('button')!;

    expect(row.getAttribute('type')).toBe('button');
    expect(row.textContent).toBe('Add Tag');
    expect(row.className.split(' ')).toEqual(
      expect.arrayContaining([
        'min-h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        // greyed while a locked composer's fieldset disables it
        'disabled:opacity-50',
        'disabled:cursor-not-allowed',
      ])
    );
    expect(row.querySelector('svg')!.getAttribute('class')).toContain(
      'rtl:rotate-180'
    );
    await click(row);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
