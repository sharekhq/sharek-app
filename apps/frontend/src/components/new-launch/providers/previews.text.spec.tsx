import { act, FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The real sanitizer runs: jest.config.ts maps isomorphic-dompurify to its
// browser build on happy-dom's window.
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) =>
    select({ current: 'global' }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
// Facebook's preview reads its background preset from the post settings form.
jest.mock('react-hook-form', () => ({
  useFormContext: () => null,
  useWatch: () => undefined,
}));

import dayjs from 'dayjs';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { GeneralPreviewComponent } from '@gitroom/frontend/components/launches/general.preview.component';
import { FacebookPreview } from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.preview';
import { InstagramPreview } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.preview';
import { LinkedinPreview } from '@gitroom/frontend/components/new-launch/providers/linkedin/linkedin.preview';
import { PinterestPreview } from '@gitroom/frontend/components/new-launch/providers/pinterest/pinterest.preview';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';

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

const channel = {
  id: 'int-1',
  name: 'Sharek Café',
  display: 'sharek.cafe',
  identifier: 'instagram',
  picture: 'https://media.sharek.app/int-1.png',
};

const showPreview = (
  Preview: FC<{ maximumCharacters?: number }>,
  content: string,
  over: { name?: string; maximumCharacters?: number } = {}
) =>
  render(
    <IntegrationContext.Provider
      value={{
        date: dayjs(),
        allIntegrations: [],
        integration: { ...channel, name: over.name ?? channel.name } as any,
        value: [{ id: 'v1', content, image: [] }],
      }}
    >
      <Preview maximumCharacters={over.maximumCharacters} />
    </IntegrationContext.Provider>
  );

const hostile = 'onerror="document.title=1"';

// A preview shows the post's text the way the network will print it, so markup
// typed into it, or arriving through the API or an RSS feed, stays text.
describe.each([
  ['the global preview', GeneralPreviewComponent],
  ['Facebook', FacebookPreview],
  ['Instagram', InstagramPreview],
  ['LinkedIn', LinkedinPreview],
  ['Pinterest', PinterestPreview],
  ['TikTok', TiktokPreview],
  ['YouTube', YoutubePreview],
] as Array<[string, FC<{ maximumCharacters?: number }>]>)(
  '%s',
  (_name, Preview) => {
    it('does not turn markup typed as text into elements', async () => {
      const host = await showPreview(
        Preview,
        `<p>Hi &lt;img src=x ${hostile}&gt; there</p>`
      );

      expect(host.querySelector('[onerror]')).toBeNull();
      expect(host.querySelector('img[src="x"]')).toBeNull();
    });

    it('does not run markup in content stored without paragraphs', async () => {
      const host = await showPreview(Preview, `<img src=x ${hostile}>`);

      expect(host.querySelector('[onerror]')).toBeNull();
    });

    it('keeps its own mention and cropped-text markup', async () => {
      const host = await showPreview(
        Preview,
        '<p>Hello <span data-mention-id="u1" data-mention-label="Sara">@Sara</span> and the rest of the post, past the limit</p>',
        { maximumCharacters: 25 }
      );

      const mention = Array.from(host.querySelectorAll('span.font-bold')).find(
        (span) => span.textContent === '@Sara'
      );
      expect(mention?.getAttribute('style')).toBe(
        'color: var(--brand-text)'
      );
      expect(
        host.querySelector('mark[data-tooltip-id="tooltip"]')
      ).not.toBeNull();
    });
  }
);

describe('Instagram', () => {
  it("shows the channel's name as text", async () => {
    const host = await showPreview(InstagramPreview, '<p>Hi</p>', {
      name: `<img src=x ${hostile}>`,
    });

    expect(host.querySelector('[onerror]')).toBeNull();
  });
});
