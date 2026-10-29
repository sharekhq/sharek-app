import { act } from 'react';
import { createRoot } from 'react-dom/client';

// A comment's delay menu. 044 T071 F-2: under 16px, iOS Safari zooms the page
// when a field takes the focus and leaves it zoomed, so the composer read too
// wide on an iPhone.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

import { DelayComponent } from '@gitroom/frontend/components/new-launch/delay.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<DelayComponent currentIndex={1} currentDelay={0} />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the custom delay field', () => {
  it('types at 16px on a touch screen, 13px with a mouse', async () => {
    const host = await render();
    await act(async () => {
      host
        .querySelector('button[aria-label="Delay comment"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const field = host.querySelector('input[placeholder="Custom min"]');

    expect(field).toBeTruthy();
    expect(field!.className.split(' ')).toEqual(
      expect.arrayContaining(['text-[13px]', 'coarse:text-[16px]'])
    );
  });
});
