// What the creator is told when TikTok will refuse the post, before they
// schedule it (feature 012-tiktok-ux-compliance, User Story 3).
//
// Each refusal gets its own remedy, because they are not interchangeable:
// waiting fixes a daily cap and does nothing for a blocked account. The
// English defaults asserted here are pinned against the publish-time messages
// by tiktok.provider.spec.ts — that pairing is the enforceable half of FR-014.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, UseFormReturn } from 'react-hook-form';

const setPublishBlocker = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, fallback: string, options?: Record<string, any>) =>
      Object.entries(options || {}).reduce(
        (text, [name, value]) =>
          text.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
        fallback
      ),
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) => select({ setPublishBlocker }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/platform-label', () => ({
  platformLabel: () => 'TikTok',
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/high.order.provider',
  () => ({
    PostComment: { COMMENT: 'COMMENT' },
    withProvider: () => () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview',
  () => ({ TiktokPreview: () => null })
);

let integration: any;
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration', () => ({
  useIntegration: () => integration,
}));

const healthyProfile = {
  creatorNickname: 'Sharek Test',
  creatorUsername: 'sharek_test',
  privacyLevelOptions: ['PUBLIC_TO_EVERYONE'],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 600,
  errorCode: null,
};
let creatorInfo: any;
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/tiktok/use.tiktok.creator.info',
  () => ({ useTikTokCreatorInfo: () => creatorInfo })
);

import { TikTokSettings } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.provider';

const DAILY_POST_LIMIT =
  'TikTok says your daily post limit reached, please try again tomorrow';
const ACCOUNT_BANNED =
  'Account banned from posting, please check TikTok account status';
const APP_QUOTA =
  'Sharek has reached its daily TikTok publishing quota, please try again later';
const GENERIC =
  'TikTok is not accepting posts from this account right now, please try again later';

const video = [{ image: [{ id: 'm1', path: 'https://cdn/clip.mp4' }] }];

let form: UseFormReturn<any>;
const mounted: Array<{ unmount: () => void }> = [];

const Harness = () => {
  form = useForm();
  return (
    <FormProvider {...form}>
      <TikTokSettings />
    </FormProvider>
  );
};

const render = async (media: any[] = video) => {
  integration = {
    integration: { id: 'int-1', name: 'Sharek Test', identifier: 'tiktok' },
    value: media,
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<Harness />);
  });
  return root;
};

const withProfile = (overrides: Record<string, unknown>) => {
  creatorInfo = {
    data: { ...healthyProfile, ...overrides },
    error: undefined,
    isLoading: false,
  };
};

const set = async (values: Record<string, unknown>) => {
  await act(async () => {
    Object.entries(values).forEach(([name, value]) =>
      form.setValue(name, value, { shouldValidate: false })
    );
  });
};

// The panel probes the attachment's length with a hidden <video>; the browser
// reports it through loadedmetadata.
const reportVideoDuration = async (seconds: number) => {
  const element = document.querySelector('video');
  if (!element) throw new Error('no <video> rendered to read the duration from');
  Object.defineProperty(element, 'duration', {
    value: seconds,
    configurable: true,
  });
  await act(async () => {
    element.dispatchEvent(new Event('loadedmetadata'));
  });
};

const text = () => document.body.textContent ?? '';
const lastBlockedReason = () => {
  const call = setPublishBlocker.mock.calls.at(-1);
  return call?.[1];
};

beforeEach(() => {
  creatorInfo = { data: healthyProfile, error: undefined, isLoading: false };
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
  setPublishBlocker.mockClear();
});

describe('TikTok settings — the account being posted to (FR-009)', () => {
  it('names the account by its TikTok nickname', async () => {
    await render();

    expect(text()).toContain('Sharek Test');
  });

  it('still names it when the media is only going to the inbox', async () => {
    // FR-017: the creator needs to know which account receives the media
    // whichever way the post is finished.
    await render();
    await set({ content_posting_method: 'UPLOAD' });

    expect(text()).toContain('Sharek Test');
  });
});

describe('TikTok settings — each refusal gets its own remedy (FR-014)', () => {
  it.each([
    ['spam_risk_too_many_posts', DAILY_POST_LIMIT],
    ['spam_risk_user_banned_from_posting', ACCOUNT_BANNED],
    ['reached_active_user_cap', APP_QUOTA],
  ])('explains %s with its own remedy', async (errorCode, message) => {
    withProfile({ errorCode });
    await render();

    expect(text()).toContain(message);
  });

  it('falls back to a generic message for a refusal it does not recognise', async () => {
    withProfile({ errorCode: 'a_code_tiktok_has_not_documented_yet' });
    await render();

    expect(text()).toContain(GENERIC);
  });

  it.each([
    'spam_risk_too_many_posts',
    'spam_risk_user_banned_from_posting',
    'reached_active_user_cap',
    'a_code_tiktok_has_not_documented_yet',
  ])('never shows the raw %s to the creator', async (errorCode) => {
    withProfile({ errorCode });
    await render();

    expect(text()).not.toContain(errorCode);
    expect(lastBlockedReason() ?? '').not.toContain(errorCode);
  });

  it('blocks publishing while the account is refused, naming the channel', async () => {
    withProfile({ errorCode: 'spam_risk_too_many_posts' });
    await render();

    expect(lastBlockedReason()).toBe(`TikTok (@sharek_test): ${DAILY_POST_LIMIT}`);
  });

  it('blocks an inbox upload too — a blocked account cannot receive either', async () => {
    // FR-017: unlike the disclosure rules, this one is not exempt on UPLOAD.
    withProfile({ errorCode: 'spam_risk_user_banned_from_posting' });
    await render();
    await set({ content_posting_method: 'UPLOAD' });

    expect(lastBlockedReason()).toBe(`TikTok (@sharek_test): ${ACCOUNT_BANNED}`);
  });

  it('does not block an account TikTok is happy with', async () => {
    await render();

    expect(setPublishBlocker).not.toHaveBeenCalled();
  });
});

describe('TikTok settings — a video longer than the account may post (FR-015)', () => {
  it('blocks the post and states the allowed maximum', async () => {
    await render();
    await reportVideoDuration(900);

    expect(lastBlockedReason()).toBe(
      'TikTok (@sharek_test): Video is too long. This TikTok account may publish up to 10:00.'
    );
  });

  it('states the maximum this account actually has, not a fixed one', async () => {
    withProfile({ maxVideoPostDurationSec: 60 });
    await render();
    await reportVideoDuration(90);

    expect(lastBlockedReason()).toContain('up to 1:00');
  });

  it('blocks an inbox upload too — the limit belongs to the account', async () => {
    await render();
    await set({ content_posting_method: 'UPLOAD' });
    await reportVideoDuration(900);

    expect(lastBlockedReason()).toContain('Video is too long');
  });

  it('allows a video inside the limit', async () => {
    await render();
    await reportVideoDuration(120);

    expect(setPublishBlocker).not.toHaveBeenCalled();
  });

  it('allows a video exactly at the limit', async () => {
    await render();
    await reportVideoDuration(600);

    expect(setPublishBlocker).not.toHaveBeenCalled();
  });

  it('does not guess while the profile is still unknown', async () => {
    creatorInfo = { data: undefined, error: undefined, isLoading: true };
    await render();
    await reportVideoDuration(900);

    expect(setPublishBlocker).not.toHaveBeenCalled();
  });
});
