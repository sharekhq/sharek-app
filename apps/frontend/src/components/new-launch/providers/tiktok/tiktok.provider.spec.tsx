// The commercial-disclosure section TikTok rejected the application over
// (feature 012-tiktok-ux-compliance, User Story 1).
//
// The sentences asserted here are TikTok's own, quoted from its Content
// Sharing Guidelines. TikTok rejects paraphrase, so the wording is the
// requirement — these are written out in full rather than imported.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, UseFormReturn } from 'react-hook-form';

const setPublishBlocker = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) => select({ setPublishBlocker }),
}));
// Resolves through i18next, which is not booted in this runner.
jest.mock('@gitroom/frontend/components/launches/helpers/platform-label', () => ({
  platformLabel: () => 'TikTok',
}));
// The settings panel is the subject; the HOC wrapper and the preview are not.
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

let integration: any = {
  integration: { id: 'int-1', name: 'Sharek Test', identifier: 'tiktok' },
  value: [] as any[],
};
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration', () => ({
  useIntegration: () => integration,
}));

// The account's real posting profile, per contracts/creator-posting-profile.md.
const fullProfile = {
  creatorNickname: 'Sharek Test',
  creatorUsername: 'sharek_test',
  privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 600,
  errorCode: null,
};
let creatorInfo: any = { data: fullProfile, error: undefined, isLoading: false };
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/tiktok/use.tiktok.creator.info',
  () => ({ useTikTokCreatorInfo: () => creatorInfo })
);

import { TikTokSettings } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.provider';

const DISCLOSURE_NEEDS_A_CHOICE =
  'You need to indicate if your content promotes yourself, a third party, or both.';
const BRANDED_CONTENT_IS_NEVER_PRIVATE =
  'Branded content visibility cannot be set to private.';
const MUSIC_USAGE_URL =
  'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_CONTENT_POLICY_URL =
  'https://www.tiktok.com/legal/page/global/bc-policy/en';

const video = [{ image: [{ id: 'm1', path: 'https://cdn/clip.mp4' }] }];
const photo = [{ image: [{ id: 'm1', path: 'https://cdn/still.png' }] }];

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

const set = async (values: Record<string, unknown>) => {
  await act(async () => {
    Object.entries(values).forEach(([name, value]) =>
      form.setValue(name, value, { shouldValidate: false })
    );
  });
};

const text = () => document.body.textContent ?? '';
const links = () =>
  Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
const option = (value: string) =>
  document.querySelector<HTMLOptionElement>(`option[value="${value}"]`);

const visibilitySelect = () =>
  document.querySelector<HTMLSelectElement>('select[name="privacy_level"]');
const visibilityOptions = () =>
  Array.from(visibilitySelect()?.querySelectorAll('option') ?? [])
    .map((o) => o.value)
    .filter(Boolean);

// Checkbox renders the box and its label as siblings, with no <input>.
const checkbox = (label: string) => {
  const labelNode = Array.from(document.querySelectorAll('div')).find(
    (node) => node.children.length === 0 && node.textContent?.trim() === label
  );
  return labelNode?.previousElementSibling as HTMLElement | undefined;
};

const leafContaining = (needle: string) =>
  Array.from(document.querySelectorAll('div')).find(
    (node) =>
      node.children.length === 0 && (node.textContent ?? '').includes(needle)
  );

// Controls TikTok has no field for stay mounted so their values survive — the
// panel hides them the same way it hides direct-post-only settings in upload
// mode — so "not offered" means visually hidden, not absent from the DOM.
const isHidden = (element: Element | null | undefined) => {
  for (let node = element; node; node = node.parentElement) {
    if (node.classList?.contains('invisible')) return true;
  }
  return false;
};

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
  setPublishBlocker.mockClear();
  integration = {
    integration: { id: 'int-1', name: 'Sharek Test', identifier: 'tiktok' },
    value: [],
  };
  creatorInfo = { data: fullProfile, error: undefined, isLoading: false };
});

describe('TikTok settings — defaults (FR-001, FR-002)', () => {
  it('starts with the disclosure setting off', async () => {
    await render();
    expect(form.getValues('disclose')).toBe(false);
  });

  it('starts with neither commercial option selected', async () => {
    await render();
    expect(form.getValues('brand_organic_toggle')).toBe(false);
    expect(form.getValues('brand_content_toggle')).toBe(false);
  });
});

describe('TikTok settings — visibility comes from the account (FR-010)', () => {
  it('offers exactly the options TikTok allows this account, and no others', async () => {
    await render();

    expect(visibilityOptions()).toEqual(['PUBLIC_TO_EVERYONE', 'SELF_ONLY']);
  });

  it('follows a different account onto a different set of options', async () => {
    creatorInfo = {
      data: {
        ...fullProfile,
        privacyLevelOptions: ['FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS'],
      },
      error: undefined,
      isLoading: false,
    };
    await render();

    expect(visibilityOptions()).toEqual([
      'FOLLOWER_OF_CREATOR',
      'MUTUAL_FOLLOW_FRIENDS',
    ]);
  });

  it('pre-selects nothing — publishing to everyone must be chosen deliberately', async () => {
    await render();

    expect(form.getValues('privacy_level')).toBeFalsy();
    expect(visibilitySelect()?.value).toBe('');
  });
});

describe('TikTok settings — publishing needs a visibility (FR-010)', () => {
  const CHOOSE_A_VISIBILITY = 'Choose who can see this post.';

  it('blocks publishing until a visibility is chosen', async () => {
    // Nothing is pre-selected, so a creator who adds TikTok and never opens
    // its settings lands here. Without the block they reach submit and get the
    // settings class's raw "privacy_level must be one of..." instead.
    await render();

    expect(setPublishBlocker).toHaveBeenLastCalledWith(
      'int-1',
      `TikTok (@sharek_test): ${CHOOSE_A_VISIBILITY}`
    );
  });

  it('lifts the block once one is chosen', async () => {
    await render();
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE' });

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('does not ask for one when the media only goes to the inbox', async () => {
    // TikTok discards the visibility on UPLOAD (FR-017).
    await render();
    await set({ content_posting_method: 'UPLOAD' });

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('says the settings could not be loaded rather than asking for a choice', async () => {
    // Asking someone to choose from a list that failed to load is a dead end.
    creatorInfo = { data: false, error: undefined, isLoading: false };
    await render();

    expect(setPublishBlocker.mock.calls.at(-1)?.[1]).toContain(
      'TikTok settings could not be loaded'
    );
  });

  it('still leads with TikTok’s mandated sentence when both are unanswered', async () => {
    // FR-005's wording is what the reviewer checks on hover, so it outranks
    // the visibility prompt when neither has been answered.
    await render();
    await set({ disclose: true });

    expect(setPublishBlocker.mock.calls.at(-1)?.[1]).toContain(
      DISCLOSURE_NEEDS_A_CHOICE
    );
  });
});

describe('TikTok settings — interactions start off (FR-011, FR-012)', () => {
  it.each(['Allow Comments', 'Allow Duet', 'Allow Stitch'])(
    'leaves %s unselected on a new post',
    async (label) => {
      await render();

      expect(checkbox(label)?.getAttribute('aria-disabled')).toBeNull();
    }
  );

  it('registers comments as off rather than on', async () => {
    await render();

    expect(form.getValues('comment')).toBe(false);
  });

  it.each([
    ['commentDisabled', 'Allow Comments'],
    ['duetDisabled', 'Allow Duet'],
    ['stitchDisabled', 'Allow Stitch'],
  ])(
    'greys out %s when the creator disabled it in TikTok',
    async (flag, label) => {
      creatorInfo = {
        data: { ...fullProfile, [flag]: true },
        error: undefined,
        isLoading: false,
      };
      await render();

      expect(checkbox(label)?.getAttribute('aria-disabled')).toBe('true');
    }
  );
});

describe('TikTok settings — auto add music is photo-only', () => {
  // The mirror of the video-only controls: the provider only puts
  // auto_add_music in post_info for a photo, because TikTok has no such field
  // for video, so offering it on a video post is a setting that silently does
  // nothing.
  const musicSelect = () =>
    document.querySelector<HTMLSelectElement>('select[name="autoAddMusic"]');

  it('offers it on a photo post', async () => {
    await render(photo);

    expect(isHidden(musicSelect())).toBe(false);
  });

  it('does not offer it on a video post', async () => {
    await render(video);

    expect(isHidden(musicSelect())).toBe(true);
  });

  it('keeps it registered, so the settings class still receives a value', async () => {
    await render(video);

    expect(form.getValues('autoAddMusic')).toBe('no');
  });

  it('describes what it does instead of apologising for being shown', async () => {
    await render(photo);

    expect(text()).toContain(
      'TikTok adds a default track, which you can change later.'
    );
    expect(text()).not.toContain('This feature available only for photos');
  });
});

describe('TikTok settings — video-only controls on a photo post (FR-013)', () => {
  it.each(['Allow Duet', 'Allow Stitch', 'Video made with AI'])(
    'does not offer %s for a photo post',
    async (label) => {
      await render(photo);

      expect(isHidden(checkbox(label))).toBe(true);
    }
  );

  it.each(['Allow Duet', 'Allow Stitch', 'Video made with AI'])(
    'still offers %s for a video post',
    async (label) => {
      await render(video);

      expect(isHidden(checkbox(label))).toBe(false);
    }
  );

  it('keeps offering comments on a photo post — TikTok honours that one', async () => {
    await render(photo);

    expect(isHidden(checkbox('Allow Comments'))).toBe(false);
  });
});

describe('TikTok settings — the profile cannot be retrieved', () => {
  const unreachable = [
    ['a transport failure', { data: undefined, error: new Error('offline'), isLoading: false }],
    // The generic function dispatcher answers `false` when the provider call
    // fails, rather than an error status.
    ['a refused dispatch', { data: false, error: undefined, isLoading: false }],
  ] as const;

  it.each(unreachable)('says the settings could not be loaded after %s', async (_label, state) => {
    creatorInfo = state;
    await render();

    expect(text()).toContain('TikTok settings could not be loaded');
  });

  it.each(unreachable)('offers no visibility options after %s', async (_label, state) => {
    // An empty list must never be presented as the account's real permissions.
    creatorInfo = state;
    await render();

    expect(visibilityOptions()).toEqual([]);
  });
});

describe('TikTok settings — the disclosure section is not about video', () => {
  // TikTok's guidelines word this whole section around "content", and only the
  // label prompt switches on the attachment. Ours said "video" throughout,
  // which is both wrong on a photo post and further from TikTok's own copy.
  it.each([
    'Content disclosure',
    'Indicate whether this content promotes yourself, a brand, product or service.',
    'You are promoting yourself or your own business.',
    'This content will be classified as Brand Organic.',
    'You are promoting another brand or a third party.',
    'This content will be classified as Branded Content.',
  ])('says "%s" whatever is attached', async (sentence) => {
    await render(photo);

    expect(text()).toContain(sentence);
  });

  it.each([
    'Disclose Video Content',
    'this video promotes goods or services',
    'your own brand.',
    'This video will be classified as Brand Organic.',
    'This video will be classified as Branded Content.',
    'once your video is posted',
  ])('no longer says "%s"', async (stale) => {
    // Disclosure on with a choice made, so the label notice renders too —
    // it is the one part of this section that is not merely hidden when off.
    await render(photo);
    await set({ disclose: true, brand_organic_toggle: true });

    expect(text()).not.toContain(stale);
  });

  it('asks who can see this post, not this video', async () => {
    await render(photo);

    expect(text()).toContain('Who can see this post?');
    expect(text()).not.toContain('Who can see this video?');
  });

  it('still switches the label prompt on the attachment, the one place TikTok does', async () => {
    await render(photo);
    await set({ disclose: true, brand_organic_toggle: true });

    expect(text()).toContain(
      "Your photo will be labeled as 'Promotional content'"
    );
  });
});

describe('TikTok settings — what happens after publishing (FR-016)', () => {
  const NOTICE = 'may take a few minutes to process';

  it('warns that a published post takes a few minutes to appear', async () => {
    // Without this, a post that has not surfaced yet reads as a failure and
    // arrives as a support ticket.
    await render();

    expect(text()).toContain(NOTICE);
  });

  it('names the TikTok profile as where the post will appear', async () => {
    await render();

    expect(leafContaining(NOTICE)?.textContent).toContain('TikTok profile');
  });

  it('makes no such promise for media that only goes to the inbox', async () => {
    // FR-017 exempts the processing notice on UPLOAD: nothing is published, so
    // there is nothing to wait for.
    await render();
    await set({ content_posting_method: 'UPLOAD' });

    expect(isHidden(leafContaining(NOTICE))).toBe(true);
  });
});

describe('TikTok settings — the label follows the selection (FR-003, FR-004)', () => {
  it('states no label while disclosure is on but nothing is chosen', async () => {
    // The rejected behaviour: the panel announced "Promotional Content" off the
    // disclosure toggle alone, before the creator had chosen anything.
    await render();
    await set({ disclose: true });

    expect(text()).not.toContain('will be labeled');
  });

  it('labels "Your Brand" alone as promotional content', async () => {
    await render();
    await set({ disclose: true, brand_organic_toggle: true });

    expect(text()).toContain(
      "Your video will be labeled as 'Promotional content'"
    );
  });

  it('labels "Branded Content" alone as a paid partnership', async () => {
    await render();
    await set({ disclose: true, brand_content_toggle: true });

    expect(text()).toContain("Your video will be labeled as 'Paid partnership'");
  });

  it('labels both options together as a paid partnership, not promotional', async () => {
    await render();
    await set({
      disclose: true,
      brand_organic_toggle: true,
      brand_content_toggle: true,
    });

    expect(text()).toContain("Your video will be labeled as 'Paid partnership'");
    expect(text()).not.toContain("'Promotional content'");
  });

  it('says photo rather than video when the attachment is a photo', async () => {
    await render(photo);
    await set({ disclose: true, brand_organic_toggle: true });

    expect(text()).toContain(
      "Your photo will be labeled as 'Promotional content'"
    );
  });
});

describe('TikTok settings — the declaration is on every post (FR-007)', () => {
  it('agrees to the Music Usage Confirmation even with disclosure off', async () => {
    await render();

    expect(text()).toContain("By posting, you agree to TikTok's");
    expect(links()).toContain(MUSIC_USAGE_URL);
  });

  it('does not mention the Branded Content Policy on a non-branded post', async () => {
    await render();

    expect(links()).not.toContain(BRANDED_CONTENT_POLICY_URL);
  });

  it('adds the Branded Content Policy, before the music confirmation, when branded', async () => {
    await render();
    await set({ disclose: true, brand_content_toggle: true });

    const hrefs = links();
    expect(hrefs).toContain(BRANDED_CONTENT_POLICY_URL);
    expect(hrefs).toContain(MUSIC_USAGE_URL);
    // FR-007 quotes the order: "Branded Content Policy and Music Usage Confirmation".
    expect(hrefs.indexOf(BRANDED_CONTENT_POLICY_URL)).toBeLessThan(
      hrefs.indexOf(MUSIC_USAGE_URL)
    );
  });
});

describe('TikTok settings — branded content is never private (FR-006)', () => {
  it('leaves private visibility selectable on a non-branded post', async () => {
    await render();

    expect(option('SELF_ONLY')?.disabled).toBe(false);
    expect(text()).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('makes private visibility unselectable while branded content is on', async () => {
    await render();
    await set({ disclose: true, brand_content_toggle: true });

    expect(option('SELF_ONLY')?.disabled).toBe(true);
  });

  it('states the reason as text, not by styling alone', async () => {
    await render();
    await set({ disclose: true, brand_content_toggle: true });

    expect(text()).toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('clears a visibility already set to private', async () => {
    await render();
    await set({ privacy_level: 'SELF_ONLY' });
    await set({ disclose: true, brand_content_toggle: true });

    expect(form.getValues('privacy_level')).not.toBe('SELF_ONLY');
  });
});

describe('TikTok settings — publishing is blocked without a choice (FR-005)', () => {
  it('blocks publishing, naming the channel and TikTok’s reason', async () => {
    await render();
    await set({ disclose: true });

    // Attributed by the TikTok handle from the creator profile, per the
    // data model's tooltip-attribution rule.
    expect(setPublishBlocker).toHaveBeenLastCalledWith(
      'int-1',
      `TikTok (@sharek_test): ${DISCLOSURE_NEEDS_A_CHOICE}`
    );
  });

  it('falls back to the channel name when the profile is unavailable', async () => {
    // A blocked channel must still name itself even when the handle could not
    // be fetched, or a mixed post reads as an unexplained global freeze.
    creatorInfo = { data: false, error: undefined, isLoading: false };
    await render();
    await set({ disclose: true });

    expect(setPublishBlocker).toHaveBeenLastCalledWith(
      'int-1',
      `TikTok (Sharek Test): ${DISCLOSURE_NEEDS_A_CHOICE}`
    );
  });

  // These answer the visibility first, so the only thing left that can block
  // is the disclosure rule under test.
  it('does not block before disclosure is switched on', async () => {
    await render();
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE' });

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('lifts the block once an option is chosen', async () => {
    await render();
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE', disclose: true });
    await set({ brand_organic_toggle: true });

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('lifts the block when disclosure is switched back off', async () => {
    await render();
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE', disclose: true });
    await set({ disclose: false });

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('lifts the block when the channel leaves the post', async () => {
    // Settings panels stay mounted for every selected channel, so an uncleared
    // blocker from a removed channel would outlive its cause.
    const root = await render();
    await set({ disclose: true });
    await act(async () => root.unmount());
    mounted.pop();

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('never blocks an upload to the TikTok inbox, where TikTok discards disclosure', async () => {
    await render();
    await set({ content_posting_method: 'UPLOAD', disclose: true });

    expect(setPublishBlocker).not.toHaveBeenCalledWith(
      'int-1',
      expect.stringContaining(DISCLOSURE_NEEDS_A_CHOICE)
    );
  });
});
