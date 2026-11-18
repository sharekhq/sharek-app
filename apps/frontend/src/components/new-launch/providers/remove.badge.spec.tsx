import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The red x on a Subreddit / channel settings row: dark mode measured white
// on the error red at 2.81:1, so the x takes the colour made for it.
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/high.order.provider',
  () => ({
    PostComment: { POST: 'POST', COMMENT: 'COMMENT' },
    withProvider: (options: { SettingsComponent: unknown }) =>
      options.SettingsComponent,
  })
);
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({ register: () => ({}), control: {} }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration',
  () => ({
    useIntegration: () => ({ value: [] }),
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.formatting',
  () => ({
    useFormatting: () => ({}),
  })
);
jest.mock('react-hook-form', () => ({
  useFieldArray: () => ({
    fields: [{ id: 'one' }],
    append: jest.fn(),
    remove: jest.fn(),
  }),
  useWatch: () => undefined,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => path }),
}));
jest.mock(
  '@gitroom/nestjs-libraries/dtos/posts/providers-settings/lemmy.dto',
  () => ({ LemmySettingsDto: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/posts/providers-settings/reddit.dto',
  () => ({ RedditSettingsDto: class {}, RedditSettingsValueDto: class {} })
);
jest.mock('./warpcast/subreddit', () => ({ Subreddit: () => null }));
jest.mock('./lemmy/subreddit', () => ({ Subreddit: () => null }));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/reddit/subreddit',
  () => ({ Subreddit: () => null })
);

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe.each([
  [
    'warpcast',
    () => jest.requireActual('./warpcast/warpcast.provider').default,
  ],
  ['lemmy', () => jest.requireActual('./lemmy/lemmy.provider').default],
  ['reddit', () => jest.requireActual('./reddit/reddit.provider').default],
])('the %s remove badge', (_name, load) => {
  it('remove badge uses on-error', async () => {
    const Settings = load();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Settings />);
    });
    const badge = Array.from(host.querySelectorAll('div')).find(
      (el) => el.textContent === 'x' && el.className.includes('bg-error')
    );
    expect(badge).toBeTruthy();
    expect(badge!.className).toContain('text-[color:var(--on-error)]');
    expect(badge!.className).not.toContain('text-textColor');
    await act(async () => root.unmount());
    host.remove();
  });
});
