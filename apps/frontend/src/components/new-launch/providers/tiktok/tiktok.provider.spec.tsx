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
// The real hook is `useContext(IntegrationContext)` — a channel per panel, not
// a channel per module — so the mock keeps that shape. A panel mounted inside a
// provider gets that channel; a panel mounted without one falls back to the
// single-channel default every test below is written against.
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration', () => {
  const { createContext, useContext } = require('react');
  const IntegrationContext = createContext(undefined);
  return {
    IntegrationContext,
    useIntegration: () => useContext(IntegrationContext) ?? integration,
  };
});

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
// What the provider actually returns when TikTok refuses the account: HTTP
// 200 carrying an error code and nothing else, so every other field falls back
// — `privacyLevelOptions` to an empty array (tiktok.provider.ts:437-449). A
// profile object arrived; a usable answer did not.
const refusedProfile = {
  creatorNickname: '',
  creatorUsername: '',
  privacyLevelOptions: [] as string[],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 0,
  errorCode: 'reached_active_user_cap',
};
let creatorInfo: any = { data: fullProfile, error: undefined, isLoading: false };
// Keyed by channel: the panel asks for its own channel's profile, and two
// TikTok channels in one post must never share one answer. An id nobody
// registered falls back to the single-channel default.
const profileByChannel: Record<string, any> = {};
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/tiktok/use.tiktok.creator.info',
  () => ({
    useTikTokCreatorInfo: (id?: string) =>
      profileByChannel[id ?? ''] ?? creatorInfo,
  })
);

import { TikTokSettings } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.provider';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';

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

// One panel per selected channel, which is how the composer mounts them: each
// with its own channel, its own profile and its own settings form. `render`
// above stays the default path — every other test in this file is one channel.
const forms: Record<string, UseFormReturn<any>> = {};
const panels: Record<string, HTMLElement> = {};

const channelContext = (id: string, name: string, media: any[]): any => ({
  integration: { id, name, identifier: 'tiktok' },
  value: media,
});

const ChannelHarness = (props: { id: string; name: string; media: any[] }) => {
  const channelForm = useForm();
  forms[props.id] = channelForm;
  return (
    <IntegrationContext.Provider
      value={channelContext(props.id, props.name, props.media)}
    >
      <FormProvider {...channelForm}>
        <TikTokSettings />
      </FormProvider>
    </IntegrationContext.Provider>
  );
};

const renderChannels = async (
  channels: Array<{
    id: string;
    name?: string;
    media?: any[];
    creatorInfo?: any;
  }>
) => {
  channels.forEach((channel) => {
    if (channel.creatorInfo !== undefined) {
      profileByChannel[channel.id] = channel.creatorInfo;
    }
  });

  await act(async () => {
    channels.forEach(({ id, name = id, media = video }) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      panels[id] = host;
      const root = createRoot(host);
      mounted.push(root);
      root.render(<ChannelHarness id={id} name={name} media={media} />);
    });
  });
};

const set = async (values: Record<string, unknown>) => {
  await act(async () => {
    Object.entries(values).forEach(([name, value]) =>
      form.setValue(name, value, { shouldValidate: false })
    );
  });
};

// Every query takes the panel to look inside, defaulting to the whole document
// so the single-channel tests read exactly as they did. With two panels mounted
// an unscoped query silently answers about the first one, which is how a
// per-channel assertion passes while proving nothing.
type Root = HTMLElement | Document;

const text = (root: Root = document.body) => root.textContent ?? '';
const links = (root: Root = document) =>
  Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
const option = (value: string, root: Root = document) =>
  root.querySelector<HTMLOptionElement>(`option[value="${value}"]`);

const visibilitySelect = (root: Root = document) =>
  root.querySelector<HTMLSelectElement>('select[name="privacy_level"]');
const visibilityOptions = (root: Root = document) =>
  Array.from(visibilitySelect(root)?.querySelectorAll('option') ?? [])
    .map((o) => o.value)
    .filter(Boolean);
// Select keeps the error row rendered even when empty, so the field below it
// does not jump; trim() flattens the non-breaking space it reserves.
const visibilityError = (root: Root = document) =>
  visibilitySelect(root)
    ?.parentElement?.parentElement?.querySelector('.text-error')
    ?.textContent?.trim() ?? '';

// Checkbox renders the box and its label as siblings, with no <input>.
const checkbox = (label: string, root: Root = document) => {
  const labelNode = Array.from(root.querySelectorAll('div')).find(
    (node) => node.children.length === 0 && node.textContent?.trim() === label
  );
  return labelNode?.previousElementSibling as HTMLElement | undefined;
};

const leafContaining = (needle: string, root: Root = document) =>
  Array.from(root.querySelectorAll('div')).find(
    (node) =>
      node.children.length === 0 && (node.textContent ?? '').includes(needle)
  );

// The description block that follows the Branded content checkbox — "beside
// it" in the DOM, which is what FR-002 asks for and what a reviewer reads.
const brandedContentNote = (root: Root = document) =>
  checkbox('Branded content', root)?.parentElement?.nextElementSibling
    ?.textContent ?? '';

const occurrences = (needle: string, root: Root = document.body) =>
  text(root).split(needle).length - 1;

// The store is one mock for every panel, so "was this channel blocked" is the
// last call naming that channel, not the last call.
const lastBlockerFor = (id: string) =>
  setPublishBlocker.mock.calls.filter((call) => call[0] === id).at(-1)?.[1];

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
  // A profile registered for a channel must not outlive its test, or the next
  // one silently reads a stale account.
  [profileByChannel, forms, panels].forEach((registry) =>
    Object.keys(registry).forEach((id) => delete registry[id])
  );
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

describe('TikTok settings — a withdrawn visibility is not a choice (FR-011, FR-012)', () => {
  // The creator went private after scheduling the post. The visibility they
  // picked is not one this account offers any more, so it is no choice at all
  // — and the panel's existing block says so, in the composer, rather than
  // letting TikTok refuse the post hours later.
  const CHOOSE_A_VISIBILITY = 'Choose who can see this post.';

  it('treats a stored visibility the account no longer permits as unchosen', async () => {
    await render();
    await set({ privacy_level: 'FOLLOWER_OF_CREATOR' });

    expect(form.getValues('privacy_level')).toBeFalsy();
    expect(visibilitySelect()?.value).toBe('');
    expect(setPublishBlocker).toHaveBeenLastCalledWith(
      'int-1',
      `TikTok (@sharek_test): ${CHOOSE_A_VISIBILITY}`
    );
  });

  it('leaves a stored visibility the account still permits alone (FR-013)', async () => {
    await render();
    await set({ privacy_level: 'SELF_ONLY' });

    expect(form.getValues('privacy_level')).toBe('SELF_ONLY');
    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it.each([
    ['could not be retrieved', { data: false, error: undefined, isLoading: false }],
    // The one the `!profile` guard misses: TikTok answered, with a refusal
    // code and no option list. An object arrived; an answer did not.
    ['came back as a refusal', { data: refusedProfile, error: undefined, isLoading: false }],
  ])('clears nothing when the profile %s', async (_case, profile) => {
    // An empty option list is TikTok not answering, not an account that
    // permits nothing — clearing on it would discard a good stored choice.
    creatorInfo = profile;
    await render();
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE' });

    expect(form.getValues('privacy_level')).toBe('PUBLIC_TO_EVERYONE');
  });

  it('lifts the block once the creator chooses from what is offered', async () => {
    await render();
    await set({ privacy_level: 'FOLLOWER_OF_CREATOR' });
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE' });

    expect(form.getValues('privacy_level')).toBe('PUBLIC_TO_EVERYONE');
    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
  });

  it('never blocks an upload to the inbox over it (FR-017)', async () => {
    await render();
    await set({
      content_posting_method: 'UPLOAD',
      privacy_level: 'FOLLOWER_OF_CREATOR',
    });

    expect(setPublishBlocker).toHaveBeenLastCalledWith('int-1', undefined);
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

describe('TikTok settings — an unavailable permission carries no value (FR-006, FR-007)', () => {
  // A greyed checkbox with a checkmark inside it is the state the panel could
  // reach before: the profile said the account disallows comments, the panel
  // greyed the control, and the stored `true` went to TikTok anyway. The
  // answer that greys the control is the answer that clears it.
  it.each([
    ['commentDisabled', 'Allow Comments', 'comment'],
    ['duetDisabled', 'Allow Duet', 'duet'],
    ['stitchDisabled', 'Allow Stitch', 'stitch'],
  ])(
    'clears a stored %s the account no longer allows',
    async (flag, label, field) => {
      creatorInfo = {
        data: { ...fullProfile, [flag]: true },
        error: undefined,
        isLoading: false,
      };
      await render();
      await set({ [field]: true });

      expect(checkbox(label)?.getAttribute('aria-disabled')).toBe('true');
      expect(form.getValues(field)).toBe(false);
    }
  );

  const noAnswerYet = [
    // The window in which a stuck value is created: live controls, no profile.
    ['is still in flight', { data: undefined, error: undefined, isLoading: true }],
    ['could not be retrieved', { data: false, error: undefined, isLoading: false }],
  ] as const;

  it.each(noAnswerYet)(
    'sets none of them while the profile %s',
    async (_label, state) => {
      creatorInfo = state;
      await render();

      ['Allow Comments', 'Allow Duet', 'Allow Stitch'].forEach((label) => {
        expect(checkbox(label)?.getAttribute('aria-disabled')).toBe('true');
      });
    }
  );

  it('leaves a permission the account allows exactly as the creator set it', async () => {
    await render();
    await set({ comment: true, duet: true, stitch: true });

    expect(form.getValues('comment')).toBe(true);
    expect(form.getValues('duet')).toBe(true);
    expect(form.getValues('stitch')).toBe(true);
  });
});

describe('TikTok settings — the presentation never discards a setting (R11)', () => {
  // The fastest way to break feature 012 while fixing this one: reading
  // "clear anything disabled" as covering the controls upload mode and photo
  // posts hide. Those are hidden so their values survive the switch back.
  it('keeps the interaction permissions through a switch to upload and back', async () => {
    await render();
    await set({ comment: true, duet: true, stitch: true });
    await set({ content_posting_method: 'UPLOAD' });
    await set({ content_posting_method: 'DIRECT_POST' });

    expect(form.getValues('comment')).toBe(true);
    expect(form.getValues('duet')).toBe(true);
    expect(form.getValues('stitch')).toBe(true);
  });

  it('keeps the video-only values a photo post does not offer', async () => {
    await render(photo);
    await set({ duet: true, stitch: true, video_made_with_ai: true });

    expect(form.getValues('duet')).toBe(true);
    expect(form.getValues('stitch')).toBe(true);
    expect(form.getValues('video_made_with_ai')).toBe(true);
  });
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

});

describe('TikTok settings — branded content is refused, not the visibility (FR-001, FR-003)', () => {
  // TikTok prescribes two remedies where branded content meets a private
  // visibility, and this panel used to do a third thing: clear the visibility.
  // The first remedy is what ships — the option is refused, and the creator's
  // own choice is left as they set it.
  const permitsOnlyPrivate = {
    data: { ...fullProfile, privacyLevelOptions: ['SELF_ONLY'] },
    error: undefined,
    isLoading: false,
  };

  it('refuses the selection and leaves a private visibility untouched', async () => {
    await render();
    await set({ privacy_level: 'SELF_ONLY' });
    await set({ disclose: true, brand_content_toggle: true });

    expect(checkbox('Branded content')?.getAttribute('aria-disabled')).toBe(
      'true'
    );
    expect(form.getValues('brand_content_toggle')).toBe(false);
    expect(form.getValues('privacy_level')).toBe('SELF_ONLY');
  });

  it('states the reason beside the option, as text rather than by styling', async () => {
    await render();
    await set({ privacy_level: 'SELF_ONLY', disclose: true });

    expect(brandedContentNote()).toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('says it on one side only — the side the restriction comes from', async () => {
    // The two placements are mutually exclusive by construction: an
    // unavailable option is also off, so the private visibility is not
    // restricted in turn. A second copy means the predicates overlap.
    await render();
    await set({ privacy_level: 'SELF_ONLY', disclose: true });

    expect(occurrences(BRANDED_CONTENT_IS_NEVER_PRIVATE)).toBe(1);
  });

  it('refuses it on an account that permits nothing but private, before any choice', async () => {
    // A predicate reading only the selected visibility passes every other
    // test here and misses this one.
    creatorInfo = permitsOnlyPrivate;
    await render();
    await set({ disclose: true });

    expect(form.getValues('privacy_level')).toBeFalsy();
    expect(checkbox('Branded content')?.getAttribute('aria-disabled')).toBe(
      'true'
    );
    expect(brandedContentNote()).toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('offers it again once the visibility is not private (FR-005)', async () => {
    await render();
    await set({ privacy_level: 'SELF_ONLY', disclose: true });
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE' });

    expect(checkbox('Branded content')?.getAttribute('aria-disabled')).toBeNull();
    expect(text()).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('leaves it alone when TikTok answered with a refusal instead of a profile', async () => {
    // A refusal arrives as a profile object with no option list. An empty list
    // is "no usable answer", never "this account permits nothing but private"
    // — reading it the second way refuses branded content, and clears the
    // creator's paid-partnership declaration, on an account that allows it.
    creatorInfo = { data: refusedProfile, error: undefined, isLoading: false };
    await render();
    await set({ disclose: true, brand_content_toggle: true });

    expect(checkbox('Branded content')?.getAttribute('aria-disabled')).toBeNull();
    expect(form.getValues('brand_content_toggle')).toBe(true);
    // Nothing beside the control refuses it. The sentence does render under
    // the visibility field, which is feature 012's reverse direction and
    // correct while the branded choice is on.
    expect(brandedContentNote()).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('survives a visibility being withdrawn underneath it', async () => {
    // spec.md's edge case: the visibility reads as unchosen and "the private
    // option stays unavailable" — which is only true if the branded-content
    // choice is still on. A visibility on its way out restricts nothing on
    // the way, or the creator opens the post and silently loses the
    // declaration they made.
    creatorInfo = {
      data: { ...fullProfile, privacyLevelOptions: ['PUBLIC_TO_EVERYONE'] },
      error: undefined,
      isLoading: false,
    };
    await render();
    await set({
      privacy_level: 'SELF_ONLY',
      disclose: true,
      brand_content_toggle: true,
    });

    expect(form.getValues('privacy_level')).toBeFalsy();
    expect(form.getValues('brand_content_toggle')).toBe(true);
    expect(checkbox('Branded content')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('still lets the disclosure switch clear both choices from that state', async () => {
    // Feature 012's behaviour, asserted in the state this feature adds: a
    // creator who switches the disclosure off is saying the post is not
    // commercial, and the choices go with it.
    await render();
    await set({
      privacy_level: 'SELF_ONLY',
      disclose: true,
      brand_organic_toggle: true,
    });
    await act(async () => {
      checkbox('Content disclosure')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(form.getValues('disclose')).toBe(false);
    expect(form.getValues('brand_organic_toggle')).toBe(false);
    expect(form.getValues('brand_content_toggle')).toBe(false);
    expect(form.getValues('privacy_level')).toBe('SELF_ONLY');
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

describe('TikTok settings — the disclosure and the choice arrive apart (FR-002)', () => {
  // TikTok's payload has no disclosure field: brand_organic_toggle and
  // brand_content_toggle are all it reads, and the public API takes a choice
  // with the disclosure unset. So the choice is what a post will be labeled by,
  // and the switch follows it — while switching the disclosure off is the
  // creator saying the post is not commercial, and takes the choice with it.
  const disclosedAsBranded = {
    disclose: true,
    brand_organic_toggle: true,
    brand_content_toggle: true,
  };

  const switchTheDisclosureOff = async () => {
    await act(async () => {
      checkbox('Content disclosure')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
  };

  it('switches the disclosure on for a choice that arrives without one', async () => {
    await render();
    await set({ disclose: false, brand_content_toggle: true });

    expect(form.getValues('disclose')).toBe(true);
    expect(form.getValues('brand_content_toggle')).toBe(true);
  });

  it('states the label that post will actually carry', async () => {
    await render();
    await set({ disclose: false, brand_content_toggle: true });

    expect(text()).toContain("Your video will be labeled as 'Paid partnership'");
  });

  it('clears both choices when the creator switches the disclosure off', async () => {
    await render();
    await set(disclosedAsBranded);
    await switchTheDisclosureOff();

    expect(form.getValues('disclose')).toBe(false);
    expect(form.getValues('brand_organic_toggle')).toBe(false);
    expect(form.getValues('brand_content_toggle')).toBe(false);
  });

  it('makes private visibility selectable again', async () => {
    await render();
    await set(disclosedAsBranded);
    await switchTheDisclosureOff();

    expect(option('SELF_ONLY')?.disabled).toBe(false);
  });

  it('drops the branded-content restriction that no longer applies', async () => {
    await render();
    await set(disclosedAsBranded);
    await switchTheDisclosureOff();

    expect(text()).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('drops the Branded Content Policy from the declaration', async () => {
    await render();
    await set(disclosedAsBranded);
    await switchTheDisclosureOff();

    expect(links()).not.toContain(BRANDED_CONTENT_POLICY_URL);
  });

  it('leaves a choice made under a disclosure that is on alone', async () => {
    await render();
    await set(disclosedAsBranded);

    expect(form.getValues('brand_content_toggle')).toBe(true);
    expect(form.getValues('brand_organic_toggle')).toBe(true);
  });
});

describe('TikTok settings — the visibility error is written for a creator', () => {
  // The composer validates through the same settings class as the public API
  // and prints whatever it reports under the field. That message is the API's:
  // English, and about wire values rather than about the choice.
  const SETTINGS_CLASS_MESSAGE =
    'Choose who can see this post - one of PUBLIC_TO_EVERYONE, ' +
    'MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR or SELF_ONLY.';

  const refuseTheVisibility = async () => {
    await act(async () => {
      form.setError('privacy_level', { message: SETTINGS_CLASS_MESSAGE });
    });
  };

  it('asks for the choice in the same words as the blocked publish control', async () => {
    await render();
    await refuseTheVisibility();

    expect(visibilityError()).toBe('Choose who can see this post.');
  });

  it('never shows the creator the values TikTok’s API uses', async () => {
    await render();
    await refuseTheVisibility();

    expect(text()).not.toContain('PUBLIC_TO_EVERYONE');
  });

  it('keeps to the short sentence where the profile is what failed', async () => {
    // The notice above already explains that failure at length, and the field
    // is not where the panel says it a second time.
    creatorInfo = { data: false, error: undefined, isLoading: false };
    await render();
    await refuseTheVisibility();

    expect(visibilityError()).toBe('Choose who can see this post.');
    expect(text().split('TikTok settings could not be loaded').length - 1).toBe(
      1
    );
  });

  it('shows nothing under the field while the choice stands', async () => {
    await render();
    await set({ privacy_level: 'PUBLIC_TO_EVERYONE' });

    expect(visibilityError()).toBe('');
  });

  it('does not pull the branded-content restriction over a visible error', async () => {
    // The note's negative margin closes the gap the field reserves for its
    // error row; with an error actually in that row it lands on top of it.
    await render();
    await set({ disclose: true, brand_content_toggle: true });
    await refuseTheVisibility();

    expect(
      leafContaining(BRANDED_CONTENT_IS_NEVER_PRIVATE)?.className
    ).not.toContain('-mt-');
  });
});

describe('TikTok settings — nothing shown unavailable is left switched on (SC-001)', () => {
  // What the whole feature reduces to. The per-story tests each cover their
  // own row; this one covers the combinations nobody thought to enumerate.
  const CONTROLS: Array<[label: string, field: string]> = [
    ['Allow Comments', 'comment'],
    ['Allow Duet', 'duet'],
    ['Allow Stitch', 'stitch'],
    ['Video made with AI', 'video_made_with_ai'],
    ['Content disclosure', 'disclose'],
    ['Your brand', 'brand_organic_toggle'],
    ['Branded content', 'brand_content_toggle'],
  ];

  const everythingOn = {
    disclose: true,
    brand_organic_toggle: true,
    brand_content_toggle: true,
    comment: true,
    duet: true,
    stitch: true,
    video_made_with_ai: true,
  };

  const profiles = {
    inFlight: { data: undefined, error: undefined, isLoading: true },
    unreachable: { data: false, error: undefined, isLoading: false },
    noInteractions: {
      data: {
        ...fullProfile,
        commentDisabled: true,
        duetDisabled: true,
        stitchDisabled: true,
      },
      error: undefined,
      isLoading: false,
    },
    onlyPrivate: {
      data: { ...fullProfile, privacyLevelOptions: ['SELF_ONLY'] },
      error: undefined,
      isLoading: false,
    },
    neverPrivate: {
      data: { ...fullProfile, privacyLevelOptions: ['PUBLIC_TO_EVERYONE'] },
      error: undefined,
      isLoading: false,
    },
    refused: { data: refusedProfile, error: undefined, isLoading: false },
  };

  // The three the profile speaks to, and the only ones whose unavailability
  // can come from "no answer yet" rather than from an answer.
  const INTERACTIONS = ['comment', 'duet', 'stitch'];

  it.each([
    ['a fresh post on a healthy account', undefined, {}, video, true],
    ['every setting stored on, and the account allows them', undefined, everythingOn, video, true],
    ['an account that disallows all three interactions', profiles.noInteractions, everythingOn, video, true],
    ['a profile still in flight', profiles.inFlight, everythingOn, video, false],
    ['a profile that could not be retrieved', profiles.unreachable, everythingOn, video, false],
    // A refusal is an answer about the account, not about its permissions:
    // an object arrives carrying an error code and no option list.
    ['a profile that came back as a refusal', profiles.refused, { ...everythingOn, privacy_level: 'SELF_ONLY' }, video, true],
    ['a stored private visibility with branded content on', undefined, { ...everythingOn, privacy_level: 'SELF_ONLY' }, video, true],
    ['an account that permits nothing but private', profiles.onlyPrivate, everythingOn, video, true],
    // The one combination where the two reconciliations interact: clearing
    // the withdrawn visibility also lifts the branded-content restriction.
    ['a stored visibility withdrawn while branded content is selected', profiles.neverPrivate, { ...everythingOn, privacy_level: 'SELF_ONLY' }, video, true],
    ['an inbox upload carrying every direct-post setting', undefined, { ...everythingOn, content_posting_method: 'UPLOAD' }, video, true],
    ['a photo post carrying the video-only settings', undefined, everythingOn, photo, true],
  ])('holds for %s', async (_case, profile, stored, media, answered) => {
    if (profile) {
      creatorInfo = profile;
    }
    await render(media);
    await set(stored);

    const switchedOn = CONTROLS.filter(([label, field]) => {
      const control = checkbox(label);
      // Hidden is not presented: the posting method and the attachment type
      // keep their values by design, so they are outside the invariant (R11).
      if (isHidden(control)) return false;
      // Neither is an answer TikTok has not given. "No profile" is the state
      // every render starts in, so clearing on it would switch a stored
      // permission off on every reopen — before the profile arrives to say the
      // account allows it, and it would never come back (R5). The next test
      // asserts what these two rows require instead.
      if (!answered && INTERACTIONS.includes(field)) return false;
      return (
        control?.getAttribute('aria-disabled') === 'true' &&
        !!form.getValues(field)
      );
    }).map(([label]) => label);

    const select = visibilitySelect();
    const selected = isHidden(select)
      ? []
      : Array.from(select?.querySelectorAll('option') ?? [])
          .filter(
            (item) => item.disabled && item.value === form.getValues('privacy_level')
          )
          .map((item) => item.value);

    expect({ controls: switchedOn, visibility: selected }).toEqual({
      controls: [],
      visibility: [],
    });
  });

  it.each([
    ['is still in flight', profiles.inFlight],
    ['could not be retrieved', profiles.unreachable],
  ])(
    'keeps the stored permissions while the profile %s, rather than clearing them',
    async (_case, profile) => {
      // The other half of the two rows above: unavailable, and untouched. A
      // brief outage must not cost the creator the settings they saved.
      creatorInfo = profile;
      await render();
      await set({ comment: true, duet: true, stitch: true });

      expect(form.getValues('comment')).toBe(true);
      expect(form.getValues('duet')).toBe(true);
      expect(form.getValues('stitch')).toBe(true);
    }
  );
});

describe('TikTok settings — two channels in one post (FR-018 groundwork)', () => {
  // These two prove the harness, not the product. Each panel has to read its
  // own channel from context and its own profile by that channel's id, or a
  // per-channel assertion passes while both panels render the same account —
  // FR-018 verified by a test that cannot fail.
  const secondAccount = {
    data: {
      ...fullProfile,
      commentDisabled: true,
      privacyLevelOptions: ['SELF_ONLY'],
    },
    error: undefined,
    isLoading: false,
  };

  it('answers each panel with its own account’s profile', async () => {
    await renderChannels([
      { id: 'int-1' },
      { id: 'int-2', creatorInfo: secondAccount },
    ]);

    expect(visibilityOptions(panels['int-1'])).toEqual([
      'PUBLIC_TO_EVERYONE',
      'SELF_ONLY',
    ]);
    expect(visibilityOptions(panels['int-2'])).toEqual(['SELF_ONLY']);
    expect(
      checkbox('Allow Comments', panels['int-1'])?.getAttribute('aria-disabled')
    ).toBeNull();
    expect(
      checkbox('Allow Comments', panels['int-2'])?.getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('keeps a separate settings form per channel', async () => {
    await renderChannels([
      { id: 'int-1' },
      { id: 'int-2', creatorInfo: secondAccount },
    ]);

    await act(async () => {
      forms['int-1'].setValue('privacy_level', 'PUBLIC_TO_EVERYONE');
    });

    expect(forms['int-1'].getValues('privacy_level')).toBe(
      'PUBLIC_TO_EVERYONE'
    );
    expect(forms['int-2'].getValues('privacy_level')).toBeFalsy();
  });
});

describe('TikTok settings — each channel reconciles against its own account (FR-018)', () => {
  // Two TikTok accounts on one post, agreeing on everything except comments.
  const commentsOff = {
    data: { ...fullProfile, commentDisabled: true },
    error: undefined,
    isLoading: false,
  };

  const bothChannels = () =>
    renderChannels([{ id: 'int-1' }, { id: 'int-2', creatorInfo: commentsOff }]);

  it('clears the permission on the account that disallows it, and only there', async () => {
    await bothChannels();
    await act(async () => {
      forms['int-1'].setValue('comment', true);
      forms['int-2'].setValue('comment', true);
    });

    expect(forms['int-1'].getValues('comment')).toBe(true);
    expect(forms['int-2'].getValues('comment')).toBe(false);
    expect(
      checkbox('Allow Comments', panels['int-1'])?.getAttribute('aria-disabled')
    ).toBeNull();
    expect(
      checkbox('Allow Comments', panels['int-2'])?.getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('attributes a block to the channel it came from', async () => {
    // Both start blocked on an unchosen visibility; answering one must lift
    // that one alone, or a mixed post reads as an unexplained global freeze.
    await bothChannels();
    await act(async () => {
      forms['int-1'].setValue('privacy_level', 'PUBLIC_TO_EVERYONE');
    });

    expect(lastBlockerFor('int-1')).toBeUndefined();
    expect(lastBlockerFor('int-2')).toContain('Choose who can see this post.');
  });
});
