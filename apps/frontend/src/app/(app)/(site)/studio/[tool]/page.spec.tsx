import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import i18next from '@gitroom/react/translation/i18next';

// Spec 061, part 2 (FR-001, contracts/studio-addresses.md § Route). Each Studio
// tool has its own address, /studio/<tool>: this server page reads the segment
// from `params`, a Promise in Next 16, and hands it to the tool page's layout,
// which resolves it on the client. The tab keeps the Studio page's title.
//
// The language arrives through `next/headers`, mocked here to a settable value,
// and the expected titles are read from the locale files, as billing/page.spec
// does.
let mockLanguage: string | null = null;

jest.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) =>
      name === 'x-i18next-current-language' ? mockLanguage : null,
  }),
  cookies: async () => ({ get: () => undefined }),
}));

// The layout builds the catalog through SWR and the user context, none of which
// this asks anything of; a stand-in shows which tool the page handed it.
jest.mock(
  '@gitroom/frontend/components/new-layout/layout.studio.tool.component',
  () => ({
    StudioToolLayoutComponent: ({ tool }: { tool: string }) => (
      <p data-testid="studio-tool">{tool}</p>
    ),
  })
);

import Page, { generateMetadata } from './page';

const locale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

const en = locale('en');
const ar = locale('ar');

describe('the Studio tool page title', () => {
  // i18next preloads every language only when it sees no `window`; the component
  // specs install one, so the bundles are asked for explicitly here.
  beforeAll(async () => {
    await i18next.loadLanguages(['en', 'ar']);
  });

  beforeEach(() => {
    mockLanguage = null;
  });

  it('is Arabic when the request carries the Arabic language header', async () => {
    mockLanguage = 'ar';
    const { title } = await generateMetadata();
    expect(title).toBe(ar['page_title_studio']);
  });

  it('is English when no language header is set', async () => {
    const { title } = await generateMetadata();
    expect(title).toBe(en['page_title_studio']);
  });

  // Without this the pair above would still pass if the key were missing from both
  // files and the title fell through to the default on every request.
  it('renders from a key both locales carry', () => {
    expect(typeof en['page_title_studio']).toBe('string');
    expect(typeof ar['page_title_studio']).toBe('string');
    expect(ar['page_title_studio']).not.toBe(en['page_title_studio']);
  });
});

const mounted: Root[] = [];

describe('the Studio tool page', () => {
  afterEach(() => {
    mounted.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = '';
  });

  it("renders the tool page's layout with the tool from the address", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    const page = await Page({ params: Promise.resolve({ tool: 'veo3' }) });
    await act(async () => {
      root.render(page);
    });

    expect(host.children).toHaveLength(1);
    expect(host.querySelector('[data-testid="studio-tool"]')?.textContent).toBe(
      'veo3'
    );
  });
});
