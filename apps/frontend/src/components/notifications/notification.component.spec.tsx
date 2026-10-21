import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Scenery: the bell's click-away hook ships ESM only, and the row under test
// does not use it.
jest.mock('@uidotdev/usehooks', () => ({ useClickAway: () => null }));

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ShowNotification } from '@gitroom/frontend/components/notifications/notification.component';

// The app extends dayjs once, in layout/set.timezone; the row's time label
// needs fromNow.
dayjs.extend(relativeTime);

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

// A notification's text embeds channel names and the networks' error
// messages, so it is never markup.
const showContent = async (content: string) => {
  const host = await render(
    <ShowNotification
      notification={{ createdAt: '2026-10-21T10:00:00Z', content }}
      lastReadNotification="2026-10-20T10:00:00Z"
    />
  );
  return host.firstElementChild!.firstElementChild as HTMLElement;
};

describe('ShowNotification', () => {
  it('shows markup in the text as text', async () => {
    const content =
      'Error posting to <img src=x onerror="document.title=1"> on Bluesky';

    const body = await showContent(content);

    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toBe(content);
  });

  it('turns an address in the text into a link that opens apart from the app', async () => {
    const url = 'https://www.instagram.com/p/abc123/';

    const body = await showContent(`Your post is live: ${url} via Sharek`);

    const links = body.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe(url);
    expect(links[0].textContent).toBe(url);
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].className).toBe('cursor-pointer underline font-bold');
    expect(body.textContent).toBe(`Your post is live: ${url} via Sharek`);
  });

  it('shows ordinary text unchanged', async () => {
    const content = 'تم نشر منشورك على إنستغرام';

    const body = await showContent(content);

    expect(body.childElementCount).toBe(0);
    expect(body.textContent).toBe(content);
  });
});
