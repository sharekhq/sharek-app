import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The thread finisher in the X, Threads and Bluesky settings. Its editor
// declares no size, so it took the settings pane's 14px. 044 T071 F-2: under
// 16px, iOS Safari zooms the page when a field takes the focus and leaves it
// zoomed.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: unknown) =>
    typeof fallback === 'string' ? fallback : key,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration',
  () => ({
    useIntegration: () => ({ integration: { name: 'Sharek Café' } }),
  })
);
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({
    register: () => undefined,
    // the finisher is switched on, so its editor shows
    watch: (name: string) =>
      name === 'active_thread_finisher' ? true : 'That is a wrap',
    setValue: () => undefined,
  }),
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: { dummy: boolean }) => unknown) =>
    select({ dummy: false }),
}));
// The editor is the field; what it inherits is set on the box around it.
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  Editor: () => <div data-editor />,
}));

import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the thread finisher under a finger', () => {
  it('types at 16px on a touch screen, and keeps the pane size with a mouse', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<ThreadFinisher />);
    });
    const box = host.querySelector('[data-editor]')!.parentElement!;

    expect(box.className.split(' ')).toContain('coarse:text-[16px]');
    expect(box.className).not.toMatch(/(^| )text-\[\d+px\]/);
  });
});
