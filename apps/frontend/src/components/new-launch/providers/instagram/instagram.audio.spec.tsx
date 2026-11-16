import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The Instagram settings' audio search. 044 T071 F-2: under 16px, iOS Safari
// zooms the page when a field takes the focus and leaves it zoomed, so the
// composer read too wide on an iPhone.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({ getValues: () => ({}) }),
}));
// what the audio search answers; empty unless a case fills it
let mockResults: unknown[] = [];
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.custom.provider.function',
  () => ({
    useCustomProviderFunction: () => ({ get: async () => mockResults }),
  })
);

import { InstagramAudioSelector } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.audio';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (disabled?: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <InstagramAudioSelector
        name="audio"
        label="Audio"
        disabled={disabled}
        onChange={jest.fn()}
      />
    );
  });
  return host;
};

const buttonByText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find((button) =>
    (button.textContent || '').includes(text)
  )!;

const click = async (button: HTMLElement) => {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockResults = [];
});

describe('the audio search under a finger', () => {
  it('types at 16px on a touch screen, 14px with a mouse', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <InstagramAudioSelector
          name="audio"
          label="Audio"
          onChange={jest.fn()}
        />
      );
    });
    const add = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add audio'
    );
    await act(async () => {
      add!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const search = host.querySelector(
      'input[placeholder="Search audio (empty shows trending)"]'
    );

    expect(search).toBeTruthy();
    expect(search!.className.split(' ')).toEqual(
      expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
    );
  });
});

// FR-026: the shared Button's sizes, with no height, sides or text size of
// their own (contracts/inventory.md §A).
describe('the audio buttons', () => {
  const MEDIUM_SECONDARY = [
    'bg-quiet',
    'border-line',
    'h-[40px]',
    'px-[16px]',
    'text-[14px]',
  ];
  const SMALL_SECONDARY = [
    'bg-quiet',
    'border-line',
    'h-[32px]',
    'px-[12px]',
    'text-[13px]',
  ];

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as { Audio?: unknown }).Audio;
  });

  it('draws Add audio and Cancel as the medium secondary button', async () => {
    const host = await render();
    const add = buttonByText(host, 'Add audio');

    expect(add.className.split(' ')).toEqual(
      expect.arrayContaining(MEDIUM_SECONDARY)
    );
    expect(add.className.split(' ')).not.toContain('!h-[42px]');
    expect(add.className.split(' ')).not.toContain('!px-[16px]');
    await click(add);
    const cancel = buttonByText(host, 'Cancel');

    expect(cancel.className.split(' ')).toEqual(
      expect.arrayContaining(MEDIUM_SECONDARY)
    );
    expect(cancel.className.split(' ')).not.toContain('!h-[42px]');
    expect(cancel.className.split(' ')).not.toContain('!px-[16px]');
  });

  it('draws the Add audio that needs Facebook Login as the same button, disabled', async () => {
    const add = buttonByText(await render(true), 'Add audio');

    expect(add.disabled).toBe(true);
    expect(add.className.split(' ')).toEqual(
      expect.arrayContaining(MEDIUM_SECONDARY)
    );
    expect(add.className.split(' ')).not.toContain('!h-[42px]');
    expect(add.className.split(' ')).not.toContain('!px-[16px]');
  });

  it('draws Play as the small secondary button, and Stop with the brand fill while it plays', async () => {
    jest.useFakeTimers();
    mockResults = [
      {
        id: 'a1',
        title: 'Song',
        artist: 'Band',
        image: '',
        duration: 30000,
        previewUrl: 'https://audio.test/a1.mp3',
      },
    ];
    const player = { play: jest.fn(), pause: jest.fn() };
    (globalThis as { Audio?: unknown }).Audio = jest.fn(() => player);
    const host = await render();
    await click(buttonByText(host, 'Add audio'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    const play = buttonByText(host, 'Play');

    expect(play.className.split(' ')).toEqual(
      expect.arrayContaining(SMALL_SECONDARY)
    );
    expect(play.className.split(' ')).not.toContain('px-3');
    expect(play.className.split(' ')).not.toContain('text-xs');
    expect(play.className.split(' ')).not.toContain('!bg-sixth');
    expect(play.className.split(' ')).not.toContain('!bg-brand');
    await click(play);
    const stop = buttonByText(host, 'Stop');

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(stop.className.split(' ')).toEqual(
      expect.arrayContaining([...SMALL_SECONDARY, '!bg-brand', '!text-white'])
    );
  });
});
