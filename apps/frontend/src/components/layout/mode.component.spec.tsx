// The dark mode control in the top bar: one button, named by what a press will
// do, in the menu button's 40px box (research R9). The cookie and modeEmitter
// are what the rest of the app reads the mode from, so a press still flips both.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { within } from '@testing-library/react';

let mockMode = 'dark';
const mockSetMode = jest.fn();

jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [mockMode, mockSetMode],
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import ModeComponent, {
  modeEmitter,
} from '@gitroom/frontend/components/layout/mode.component';

const SUN =
  'M10.75 1V3M10.75 19V21M2.75 11H0.75M5.06412 5.31412L3.6499 3.8999M16.4359 5.31412L17.8501 3.8999M5.06412 16.69L3.6499 18.1042M16.4359 16.69L17.8501 18.1042M20.75 11H18.75M15.75 11C15.75 13.7614 13.5114 16 10.75 16C7.98858 16 5.75 13.7614 5.75 11C5.75 8.23858 7.98858 6 10.75 6C13.5114 6 15.75 8.23858 15.75 11Z';
const MOON =
  'M21.625 12.9011C20.2967 15.231 17.7898 16.8019 14.916 16.8019C10.6539 16.8019 7.19884 13.3468 7.19884 9.08473C7.19884 6.21071 8.76993 3.70363 11.1001 2.37549C6.20501 2.83962 2.37561 6.96182 2.37561 11.9784C2.37561 17.306 6.69447 21.6248 12.0221 21.6248C17.0384 21.6248 21.1605 17.7959 21.625 12.9011Z';

// The menu button's box (layout.component.tsx), centred, and today's
// select-none.
const BOX = [
  'flex',
  'items-center',
  'justify-center',
  'h-[40px]',
  'w-[40px]',
  'coarse:h-[44px]',
  'coarse:w-[44px]',
  'rounded-[10px]',
  'text-textItemBlur',
  'hover:text-newTextColor',
  'hover:bg-boxFocused',
  'transition-colors',
  'focus-visible:ring-2',
  'focus-visible:ring-brand',
  'select-none',
];

const mounted: Array<{ unmount: () => void }> = [];
const listener = jest.fn();

const render = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<ModeComponent />);
  });
  return host;
};

const press = (button: HTMLElement) => {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Class names are matched as words in className, not as CSS selectors, so the
// brackets of Tailwind's arbitrary values need no escaping.
const classesOf = (el: Element) => el.getAttribute('class')?.split(/\s+/) ?? [];

beforeEach(() => {
  mockMode = 'dark';
  mockSetMode.mockClear();
  listener.mockClear();
  modeEmitter.on('mode', listener);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  document.body.classList.remove('dark', 'light');
  modeEmitter.off('mode', listener);
});

describe('the button', () => {
  it('is one button that submits nothing', () => {
    const host = render();

    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild!.tagName).toBe('BUTTON');
    expect(host.firstElementChild!.getAttribute('type')).toBe('button');
  });

  it("carries the menu button's 40px box, centred", () => {
    const classes = classesOf(render().firstElementChild!);

    BOX.forEach((name) => expect(classes).toContain(name));
  });
});

describe('while the mode is dark', () => {
  it('is named by what a press will do', () => {
    const host = render();

    expect(
      within(host).getByRole('button', { name: 'Switch to light mode' })
    ).toBe(host.firstElementChild);
  });

  it('switches the cookie to light and tells the app', () => {
    const host = render();

    press(within(host).getByRole('button'));

    expect(mockSetMode).toHaveBeenCalledWith('light');
    expect(listener).toHaveBeenCalledWith('light');
  });

  it('shows the 22px sun, hidden from the accessibility tree', () => {
    const svgs = render().querySelectorAll('svg');

    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    expect(svgs[0].getAttribute('width')).toBe('22');
    expect(svgs[0].getAttribute('height')).toBe('22');
    expect(svgs[0].getAttribute('viewBox')).toBe('0 0 22 22');
    expect(svgs[0].querySelector('path')!.getAttribute('d')).toBe(SUN);
    expect(svgs[0].querySelector('path')!.getAttribute('stroke-width')).toBe(
      '1.5'
    );
  });

  it('puts the mode on the body', () => {
    render();

    expect(document.body.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('light')).toBe(false);
  });
});

describe('while the mode is light', () => {
  beforeEach(() => {
    mockMode = 'light';
  });

  it('is named by what a press will do', () => {
    const host = render();

    expect(
      within(host).getByRole('button', { name: 'Switch to dark mode' })
    ).toBe(host.firstElementChild);
  });

  it('switches the cookie to dark and tells the app', () => {
    const host = render();

    press(within(host).getByRole('button'));

    expect(mockSetMode).toHaveBeenCalledWith('dark');
    expect(listener).toHaveBeenCalledWith('dark');
  });

  it('shows the 24px moon, hidden from the accessibility tree', () => {
    const svgs = render().querySelectorAll('svg');

    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    expect(svgs[0].getAttribute('width')).toBe('24');
    expect(svgs[0].getAttribute('height')).toBe('24');
    expect(svgs[0].getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svgs[0].querySelector('path')!.getAttribute('d')).toBe(MOON);
    expect(svgs[0].querySelector('path')!.getAttribute('stroke-width')).toBe(
      '1.5'
    );
  });

  it('puts the mode on the body', () => {
    render();

    expect(document.body.classList.contains('light')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});
