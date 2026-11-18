import * as fs from 'fs';
import * as path from 'path';
import { act, FC, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
// The provider registry drags in every video provider. The rules under test
// are only what a provider's own card declares, so a registry that knows the
// two providers listed today, one whose card says nothing for Studio, and one
// more tool for the search's longer list, is enough. The two declarations of
// today mirror veo3.provider.tsx and image-text-slides.provider.tsx, whose own
// specs pin them. They are registered through videoWrapper, as a provider file
// registers itself, and read back from the registry, so a provider a case
// registers is listed the same way (SC-004).
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => {
  const { videoWrapper, videosList } = jest.requireActual(
    '@gitroom/frontend/components/videos/video.wrapper'
  );
  const cards: Record<string, unknown> = {
    veo3: {
      name: { key: 'video_type_veo3', fallback: 'Veo 3' },
      description: {
        key: 'video_type_veo3_desc',
        fallback: 'One continuous live-action shot.',
      },
      pills: [],
      diagram: null,
      studio: {
        kind: 'model',
        cover: '/studio/covers/veo3.webp',
        maker: { name: 'Google', logo: '/studio/makers/google.svg' },
        facts: [
          { key: 'video_type_veo3_pill_length', fallback: '~8 s' },
          { key: 'video_type_veo3_pill_quality', fallback: '1080p' },
          { key: 'video_type_veo3_fact_sound', fallback: 'Sound' },
        ],
        sampleLength: '0:08',
      },
    },
    'image-text-slides': {
      name: {
        key: 'video_type_image_text_slides',
        fallback: 'Image Text Slides',
      },
      description: {
        key: 'video_type_slides_desc',
        fallback: 'A narrated slideshow of AI images.',
      },
      pills: [],
      diagram: null,
      studio: { kind: 'tool', cover: '/studio/covers/image-text-slides.webp' },
    },
    kling: {
      name: { key: 'video_type_kling', fallback: 'Kling' },
      description: {
        key: 'video_type_kling_desc',
        fallback: 'A short clip from a prompt.',
      },
      pills: [],
      diagram: null,
    },
    'avatar-ad': {
      name: { key: 'video_type_avatar_ad', fallback: 'Avatar ad' },
      description: {
        key: 'video_type_avatar_ad_desc',
        fallback: 'An avatar reads your script.',
      },
      pills: [],
      diagram: null,
      studio: { kind: 'tool' },
    },
  };
  Object.entries(cards).forEach(([identifier, card]) =>
    videoWrapper(identifier, (): null => null, { card })
  );
  return {
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoOwnsStage: () => false,
    videoTypeCard: (identifier: string) =>
      videosList.find(
        (provider: { identifier: string }) => provider.identifier === identifier
      )?.card,
  };
});
// The AI image window's reference row opens the Media library, which drags in
// its uploader; the catalog's rules never open the window. The cover mirrors
// ai.image.tsx's export.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
  AiImageTool: () => null,
  AI_IMAGE_COVER: '/studio/covers/ai-image.webp',
}));
// useStudioCatalog's three inputs; the provider list's request stays out, its
// SWR answer steered by the cases.
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  ...jest.requireActual('@gitroom/frontend/components/launches/ai.video'),
  useAiVideoTypes: () => mockProviders,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  ...jest.requireActual('@gitroom/frontend/components/layout/user.context'),
  useUser: () => mockUser,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  ...jest.requireActual('@gitroom/react/helpers/variable.context'),
  useVariables: () => mockVariables,
}));
// Scenery: the channel panel's module loads for matchesSearch.
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);

import {
  AI_IMAGE_TOOL,
  buildStudioCatalog,
  filterStudio,
  findStudioTool,
  inPostCatalog,
  STUDIO_TOOLS,
  StudioCatalog,
  StudioChip,
  StudioSections,
  StudioToolEntry,
  studioToolHref,
  useStudioCatalog,
  videoTool,
} from '@gitroom/frontend/components/studio/studio.tools';
import {
  AI_IMAGE_COVER,
  AiImageTool,
} from '@gitroom/frontend/components/launches/ai.image';
import {
  AiVideo,
  AiVideoTool,
  VideoType,
} from '@gitroom/frontend/components/launches/ai.video';
import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';

type CatalogInput = Parameters<typeof buildStudioCatalog>[0];
type Translate = Parameters<StudioChip['label']>[0];

// What useStudioCatalog's hooks answer.
let mockProviders: {
  data: VideoType[] | undefined;
  isLoading: boolean;
  error?: Error;
};
let mockUser: CatalogInput['user'];
let mockVariables: Pick<CatalogInput, 'billingEnabled' | 'showImageEditor'>;

// What /media/video-options answers: the agent-facing description rides along
// and must never reach a card.
const veo3 = {
  identifier: 'veo3',
  title: 'Veo3 (Audio + Video)',
  description: 'Generates a video from a prompt. Use this when the user…',
};
const slides = { identifier: 'image-text-slides', title: 'Image Text Slides' };
// A provider whose chooser card declares nothing for Studio.
const kling = { identifier: 'kling', title: 'Kling (Video)' };
// A provider that ships before its card does.
const unknown = {
  identifier: 'sora',
  title: 'Sora',
  description: 'Generates a video. Use this when…',
};

const withAi = { tier: { ai: true } } as unknown as CatalogInput['user'];
const withoutAi = { tier: { ai: false } } as unknown as CatalogInput['user'];

const catalog = (overrides: Partial<CatalogInput> = {}) =>
  buildStudioCatalog({
    tools: STUDIO_TOOLS,
    videoOptions: [veo3, slides],
    user: withAi,
    billingEnabled: true,
    showImageEditor: true,
    ...overrides,
  });

// Resolves the way the components do — t(key, fallback) — against a locale
// stub, so a resolved key and a fallback can be told apart.
const translate = (locale: Record<string, string>) =>
  ((key: string, fallback: string) =>
    locale[key] ?? fallback) as unknown as Translate;

const listing = (built: StudioCatalog, id: string) =>
  built.listings.find((tool) => tool.entry.id === id)?.entry;

// Everything data-model §1 declares for a listing, with its facts resolved in
// English. An absent field reads as undefined, which toEqual leaves out.
const declared = (entry: StudioToolEntry | undefined) => ({
  kind: entry?.kind,
  category: entry?.category,
  cover: entry?.cover,
  maker: entry?.maker,
  facts: entry?.facts?.(translate({})),
  sampleLength: entry?.sampleLength,
});

const ids = (built: StudioCatalog) =>
  built.listings.map((tool) => tool.entry.id);
const videoIds = (built: StudioCatalog) =>
  built.listings
    .filter((tool) => tool.entry.category === 'video')
    .map((tool) => tool.entry.id);
const chips = (built: StudioCatalog) =>
  built.chips.map((chip) => [chip.id, chip.count]);

// A catalog as data, its text resolved in English and its ways in as flags, so
// two builds compare: every build makes the providers' functions anew.
const summary = (built: StudioCatalog) => ({
  listings: built.listings.map(({ entry, state }) => ({
    id: entry.id,
    slug: entry.slug,
    state,
    name: entry.name(translate({})),
    description: entry.description(translate({})),
    ...declared(entry),
    page: !!entry.workspace,
    window: !!entry.trigger,
  })),
  chips: built.chips.map((chip) => [
    chip.id,
    chip.label(translate({})),
    chip.count,
  ]),
  hasLockedTools: built.hasLockedTools,
  empty: built.empty,
});

// What a page tool's workspace renders for the tool page.
const page = (
  entry: StudioToolEntry | undefined,
  props: Parameters<NonNullable<StudioToolEntry['workspace']>>[0] = {
    locked: false,
    onReady: jest.fn(),
  }
) => entry?.workspace?.(props) as ReactElement<Record<string, any>>;

// A listing in Branding, which nothing fills today, so the chips' fixed order
// can be seen whole.
const brandKit: StudioToolEntry = {
  ...STUDIO_TOOLS[0],
  id: 'brand-kit',
  category: 'branding',
};

describe('the listings today', () => {
  it('lists the AI image generator as a tool in Images, with its cover', () => {
    expect(declared(listing(catalog(), 'ai-image'))).toEqual({
      kind: 'tool',
      category: 'images',
      cover: '/studio/covers/ai-image.webp',
    });
  });

  // The tool owns its sample's picture, which its windows show too (D3).
  it("reads the AI image generator's cover from the tool itself", () => {
    expect(listing(catalog(), 'ai-image')?.cover).toBe(AI_IMAGE_COVER);
  });

  it('lists the image editor as a tool in Edit & enhance, with its cover', () => {
    expect(declared(listing(catalog(), 'image-editor'))).toEqual({
      kind: 'tool',
      category: 'edit',
      cover: '/studio/covers/image-editor.webp',
    });
  });

  it('lists Image Text Slides as a tool in Video, as its card declares', () => {
    expect(declared(listing(catalog(), 'video:image-text-slides'))).toEqual({
      kind: 'tool',
      category: 'video',
      cover: '/studio/covers/image-text-slides.webp',
    });
  });

  it('lists Veo 3 as a model in Video by Google, with its facts, length and cover', () => {
    expect(declared(listing(catalog(), 'video:veo3'))).toEqual({
      kind: 'model',
      category: 'video',
      cover: '/studio/covers/veo3.webp',
      maker: { name: 'Google', logo: '/studio/makers/google.svg' },
      facts: ['~8 s', '1080p', 'Sound'],
      sampleLength: '0:08',
    });
  });

  it("resolves Veo 3's facts through the locale", () => {
    const facts = listing(catalog(), 'video:veo3')?.facts;

    expect(facts?.(translate({ video_type_veo3_fact_sound: 'صوت' }))).toEqual([
      '~8 s',
      '1080p',
      'صوت',
    ]);
  });

  it("uses the provider's own name from the registry, not the endpoint title", () => {
    const tool = listing(catalog(), 'video:veo3');

    expect(tool?.name(translate({}))).toBe('Veo 3');
    expect(tool?.name(translate({ video_type_veo3: 'Veo 3' }))).toBe('Veo 3');
  });

  it("uses the provider's own description from the registry", () => {
    const tool = listing(catalog(), 'video:veo3');

    expect(
      tool?.description(translate({ video_type_veo3_desc: 'لقطة واحدة' }))
    ).toBe('لقطة واحدة');
  });

  it('carries no AI flag on any listing', () => {
    const built = catalog({ videoOptions: [veo3, slides, kling, unknown] });

    expect(built.listings.filter((tool) => 'ai' in tool.entry)).toEqual([]);
  });
});

describe('a provider that declares nothing for Studio', () => {
  // A provider that ships before its card does still gets a card here: the
  // endpoint title names it and the generic copy describes it — never the
  // paragraph the endpoint wrote for the agent.
  it('lists a provider without a card as a model in Video, named by the endpoint title, with no cover, maker, facts or length', () => {
    const tool = listing(catalog({ videoOptions: [unknown] }), 'video:sora');
    const t = translate({
      studio_video_desc_generic: 'أنشئ فيديو بالذكاء الاصطناعي.',
    });

    expect(declared(tool)).toEqual({ kind: 'model', category: 'video' });
    expect(tool?.name(t)).toBe('Sora');
    expect(tool?.description(t)).toBe('أنشئ فيديو بالذكاء الاصطناعي.');
    expect(tool?.description(translate({}))).toBe('Generate a video with AI.');
  });

  it('lists a provider whose card has no Studio part as a model in Video, named and described by its card, with no cover, maker, facts or length', () => {
    const tool = listing(catalog({ videoOptions: [kling] }), 'video:kling');

    expect(declared(tool)).toEqual({ kind: 'model', category: 'video' });
    expect(tool?.name(translate({}))).toBe('Kling');
    expect(tool?.description(translate({}))).toBe(
      'A short clip from a prompt.'
    );
  });
});

describe('the chips', () => {
  it('shows All, Images, Video and Edit & enhance with their counts, tools and models together, while the image editor is on', () => {
    expect(chips(catalog())).toEqual([
      ['all', 4],
      ['images', 1],
      ['video', 2],
      ['edit', 1],
    ]);
  });

  it('shows All, Images and Video while the image editor is off', () => {
    expect(chips(catalog({ showImageEditor: false }))).toEqual([
      ['all', 3],
      ['images', 1],
      ['video', 2],
    ]);
  });

  it('keeps the categories in their fixed order, whatever order the listings come in', () => {
    expect(chips(catalog({ tools: [brandKit, ...STUDIO_TOOLS] }))).toEqual([
      ['all', 5],
      ['images', 1],
      ['video', 2],
      ['edit', 1],
      ['branding', 1],
    ]);
  });

  it('never shows Branding while nothing is in it', () => {
    expect(catalog().chips.map((chip) => chip.id)).not.toContain('branding');
  });

  it('still shows All when only one category has listings', () => {
    expect(chips(catalog({ tools: [], videoOptions: [veo3] }))).toEqual([
      ['all', 1],
      ['video', 1],
    ]);
  });

  it('labels each chip through the locale', () => {
    const built = catalog({ tools: [brandKit, ...STUDIO_TOOLS] });
    const ar = translate({
      studio_chip_all: 'الكل',
      studio_category_images: 'الصور',
      studio_category_video: 'الفيديو',
      studio_category_edit: 'التحرير والتحسين',
      studio_category_branding: 'الهوية البصرية',
    });

    expect(built.chips.map((chip) => chip.label(translate({})))).toEqual([
      'All',
      'Images',
      'Video',
      'Edit & enhance',
      'Branding',
    ]);
    expect(built.chips.map((chip) => chip.label(ar))).toEqual([
      'الكل',
      'الصور',
      'الفيديو',
      'التحرير والتحسين',
      'الهوية البصرية',
    ]);
  });
});

describe('availability', () => {
  it('lists one video listing per provider the platform offers, in its order', () => {
    expect(videoIds(catalog())).toEqual([
      'video:veo3',
      'video:image-text-slides',
    ]);
  });

  // Unavailable is not locked: a provider the platform does not offer has no
  // card at all, whatever the plan says.
  it('leaves out a provider the platform does not offer, even for a plan that could not use it', () => {
    const built = catalog({ videoOptions: [veo3], user: withoutAi });

    expect(videoIds(built)).toEqual(['video:veo3']);
  });

  // SHOW_IMAGE_EDITOR unset: the deployment does not offer the editor, so it
  // is absent like an unoffered provider, and Edit & enhance goes with it.
  it('leaves out the image editor where the deployment does not offer it, even for a plan that could not use it', () => {
    const built = catalog({ showImageEditor: false, user: withoutAi });

    expect(ids(built)).not.toContain('image-editor');
    expect(built.chips.map((chip) => chip.id)).not.toContain('edit');
  });

  it('lists no video and shows no Video chip when no provider is offered', () => {
    const built = catalog({ videoOptions: [] });

    expect(videoIds(built)).toEqual([]);
    expect(built.chips.map((chip) => chip.id)).toEqual([
      'all',
      'images',
      'edit',
    ]);
  });

  it('treats a list that has not loaded like an empty one', () => {
    expect(chips(catalog({ videoOptions: undefined }))).toEqual(
      chips(catalog({ videoOptions: [] }))
    );
  });
});

describe('entitlement', () => {
  it('locks every listing the plan excludes when billing is enabled', () => {
    const built = catalog({ user: withoutAi });

    const states = built.listings.map((tool) => tool.state);
    expect(states).toHaveLength(4);
    expect(states.every((state) => state === 'locked')).toBe(true);
    expect(built.hasLockedTools).toBe(true);
  });

  it('locks nothing on a plan that includes the tools', () => {
    const built = catalog();

    const states = built.listings.map((tool) => tool.state);
    expect(states).toHaveLength(4);
    expect(states.every((state) => state === 'entitled')).toBe(true);
    expect(built.hasLockedTools).toBe(false);
  });

  it('locks nothing when billing is disabled, whatever the plan says', () => {
    const built = catalog({ user: withoutAi, billingEnabled: false });

    const states = built.listings.map((tool) => tool.state);
    expect(states).toHaveLength(4);
    expect(states.every((state) => state === 'entitled')).toBe(true);
    expect(built.hasLockedTools).toBe(false);
  });
});

describe('an empty catalogue', () => {
  it('is empty only when nothing at all is listed', () => {
    expect(catalog().empty).toBe(false);
    expect(catalog({ tools: [], videoOptions: [veo3] }).empty).toBe(false);
    expect(catalog({ tools: [], videoOptions: [] }).empty).toBe(true);
  });
});

describe('addresses', () => {
  it('gives the fixed tools their id as slug and each provider its identifier', () => {
    expect(catalog().listings.map((tool) => tool.entry.slug)).toEqual([
      'image-editor',
      'ai-image',
      'veo3',
      'image-text-slides',
    ]);
  });

  it('finds a listing by its slug, and nothing for a slug no listing has', () => {
    const built = catalog();

    expect(findStudioTool(built, 'veo3')).toBe(
      built.listings.find((tool) => tool.entry.id === 'video:veo3')
    );
    expect(findStudioTool(built, 'sora')).toBeUndefined();
  });

  it('links a page tool to /studio/<slug>, and the image editor to no page', () => {
    const built = catalog();

    expect(studioToolHref(listing(built, 'ai-image')!)).toBe(
      '/studio/ai-image'
    );
    expect(studioToolHref(listing(built, 'video:veo3')!)).toBe('/studio/veo3');
    expect(studioToolHref(listing(built, 'image-editor')!)).toBeUndefined();
  });
});

describe('pages and windows', () => {
  it('opens the image editor in its window and every other listing on its page', () => {
    const built = catalog({ videoOptions: [veo3, slides, kling, unknown] });

    expect(
      built.listings.map(({ entry }) => [
        entry.id,
        { window: !!entry.trigger, page: !!entry.workspace },
      ])
    ).toEqual([
      ['image-editor', { window: true, page: false }],
      ['ai-image', { window: false, page: true }],
      ['video:veo3', { window: false, page: true }],
      ['video:image-text-slides', { window: false, page: true }],
      ['video:kling', { window: false, page: true }],
      ['video:sora', { window: false, page: true }],
    ]);
  });

  // A component made inside the catalog would be a new one on every build, and
  // the tool page would remount with each, losing its versions (D4).
  it("renders a page tool through its module's own tool body, the same one on every build", () => {
    const first = catalog();
    const second = catalog();

    expect(page(listing(first, 'ai-image')).type).toBe(AiImageTool);
    expect(page(listing(second, 'ai-image')).type).toBe(AiImageTool);
    expect(page(listing(first, 'video:veo3')).type).toBe(AiVideoTool);
    expect(page(listing(second, 'video:veo3')).type).toBe(AiVideoTool);
    expect(page(listing(first, 'video:image-text-slides')).type).toBe(
      AiVideoTool
    );
  });

  it('every page tool\'s `workspace` renders its tool with `destination="media"`, and a provider with no page keeps a window `trigger` with destination `media`', () => {
    const built = catalog({
      videoOptions: [veo3, { identifier: 'Bad:Id', title: 'Bad' }],
    });
    const onReady = jest.fn();
    const onCreatePost = jest.fn();
    const media = { id: 'm-1', path: 'https://media/m-1' };

    const image = page(listing(built, 'ai-image'), {
      locked: true,
      onReady,
      onCreatePost,
    });
    expect(image.props).toMatchObject({
      layout: 'page',
      destination: 'media',
      locked: true,
      onCreatePost,
    });
    image.props.onChange(media);
    expect(onReady).toHaveBeenLastCalledWith(media, 'image');

    const video = page(listing(built, 'video:veo3'), {
      locked: false,
      onReady,
      onCreatePost,
    });
    expect(video.props).toMatchObject({
      layout: 'page',
      destination: 'media',
      locked: false,
      onCreatePost,
      type: veo3,
    });
    video.props.onChange(media);
    expect(onReady).toHaveBeenLastCalledWith(media, 'video');

    const onSaved = jest.fn();
    const renderTrigger = jest.fn();
    const windowed = listing(built, 'video:Bad:Id')?.trigger?.({
      onSaved,
      renderTrigger,
    }) as ReactElement<Record<string, any>>;
    expect(windowed.type).toBe(AiVideo);
    expect(windowed.props).toMatchObject({
      destination: 'media',
      only: 'Bad:Id',
      onChange: onSaved,
      renderTrigger,
    });
  });

  // An address is one [a-z0-9-]+ segment, unique in the catalog.
  it.each([
    ['is not a valid address', 'Bad:Id'],
    ["repeats a fixed tool's slug", 'ai-image'],
  ])(
    'keeps the card of a provider whose identifier %s, opening it in a window',
    (_, identifier) => {
      const built = catalog({
        videoOptions: [veo3, { identifier, title: 'Provider' }],
      });
      const entry = listing(built, `video:${identifier}`);

      expect(entry).toBeDefined();
      expect(entry?.trigger).toBeDefined();
      expect(entry?.workspace).toBeUndefined();
      expect(studioToolHref(entry!)).toBeUndefined();
      expect(findStudioTool(built, 'ai-image')?.entry.id).toBe('ai-image');
    }
  );
});

describe('a new provider (SC-004)', () => {
  const Stub = (): null => null;

  it('lists a provider that registers itself with its slug, its page, its maker and facts, and changes no other listing', () => {
    const before = summary(catalog()).listings;
    videoWrapper('stub-model', Stub, {
      card: {
        name: { key: 'video_type_stub_model', fallback: 'Stub model' },
        description: {
          key: 'video_type_stub_model_desc',
          fallback: 'A stand-in model.',
        },
        pills: [],
        diagram: null,
        studio: {
          kind: 'model',
          maker: { name: 'Acme', logo: '/studio/makers/acme.svg' },
          facts: [{ key: 'video_type_stub_model_fact', fallback: '4K' }],
        },
      },
    });
    const stubModel = { identifier: 'stub-model', title: 'Stub (Video)' };
    const built = catalog({ videoOptions: [veo3, slides, stubModel] });
    const entry = listing(built, 'video:stub-model');

    expect(entry?.slug).toBe('stub-model');
    expect(entry?.name(translate({}))).toBe('Stub model');
    expect(declared(entry)).toEqual({
      kind: 'model',
      category: 'video',
      maker: { name: 'Acme', logo: '/studio/makers/acme.svg' },
      facts: ['4K'],
    });
    expect(page(entry).type).toBe(AiVideoTool);
    expect(page(entry).props.type).toBe(stubModel);
    expect(studioToolHref(entry!)).toBe('/studio/stub-model');
    expect(findStudioTool(built, 'stub-model')?.entry).toBe(entry);
    expect(
      summary(built).listings.filter((tool) => tool.id !== 'video:stub-model')
    ).toEqual(before);
  });
});

describe('useStudioCatalog', () => {
  const results: Array<ReturnType<typeof useStudioCatalog>> = [];
  const Probe: FC = () => {
    results.push(useStudioCatalog());
    return null;
  };
  const mounted: Root[] = [];
  const latest = async () => {
    const root = createRoot(document.createElement('div'));
    mounted.push(root);
    await act(async () => {
      root.render(<Probe />);
    });
    return results[results.length - 1];
  };

  beforeEach(() => {
    results.length = 0;
    mockUser = withoutAi;
    mockVariables = { billingEnabled: true, showImageEditor: false };
  });
  afterEach(() => {
    mounted.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it('builds the catalog from the user, the deployment and the provider list', async () => {
    mockProviders = { data: [veo3, slides], isLoading: false };

    const { catalog: built, loading } = await latest();

    expect(loading).toBe(false);
    expect(summary(built)).toEqual(
      summary(
        buildStudioCatalog({
          tools: STUDIO_TOOLS,
          videoOptions: [veo3, slides],
          user: withoutAi,
          billingEnabled: true,
          showImageEditor: false,
        })
      )
    );
  });

  it('is loading while the provider list loads', async () => {
    mockProviders = { data: undefined, isLoading: true };

    const { catalog: built, loading } = await latest();

    expect(loading).toBe(true);
    expect(summary(built)).toEqual(
      summary(
        buildStudioCatalog({
          tools: STUDIO_TOOLS,
          videoOptions: undefined,
          user: withoutAi,
          billingEnabled: true,
          showImageEditor: false,
        })
      )
    );
  });

  it('counts a provider list that failed as empty, so the AI image page still opens', async () => {
    mockProviders = {
      data: undefined,
      isLoading: false,
      error: new Error('Request failed with status 500'),
    };

    const { catalog: built, loading } = await latest();

    expect(loading).toBe(false);
    expect(studioToolHref(findStudioTool(built, 'ai-image')!.entry)).toBe(
      '/studio/ai-image'
    );
    expect(videoIds(built)).toEqual([]);
  });
});

describe('filterStudio', () => {
  // SC-001's size: the two fixed tools and ten providers, two of them video
  // tools and eight models, one named in Arabic with each alef that carries a
  // hamza or a madda.
  const twelve = catalog({
    videoOptions: [
      veo3,
      slides,
      kling,
      { identifier: 'avatar-ad', title: 'Avatar ad' },
      unknown,
      { identifier: 'hailuo', title: 'Hailuo' },
      { identifier: 'pika', title: 'Pika' },
      { identifier: 'ad-maker', title: 'أداة إعلانات آلية' },
      { identifier: 'luma', title: 'Luma' },
      { identifier: 'wan', title: 'Wan' },
    ],
  });
  const en = translate({});
  const VIDEO_TOOLS = ['video:image-text-slides', 'video:avatar-ad'];
  const VIDEO_MODELS = [
    'video:veo3',
    'video:kling',
    'video:sora',
    'video:hailuo',
    'video:pika',
    'video:ad-maker',
    'video:luma',
    'video:wan',
  ];

  const sectionIds = (view: StudioSections) => ({
    tools: view.tools.map((tool) => tool.entry.id),
    models: view.models.map((tool) => tool.entry.id),
  });
  const sections = (
    chip: StudioChip['id'],
    query: string,
    built: StudioCatalog = twelve
  ) => sectionIds(filterStudio(built, chip, query, en));
  // Under All, Tools then Models in one list.
  const found = (query: string) => {
    const { tools, models } = sections('all', query);
    return [...tools, ...models];
  };

  it('lists Tools then Models, each in category order then registry order', () => {
    expect(twelve.listings).toHaveLength(12);
    expect(sections('all', '')).toEqual({
      tools: ['ai-image', ...VIDEO_TOOLS, 'image-editor'],
      models: VIDEO_MODELS,
    });
  });

  it('puts Branding after Edit & enhance, whatever order the registry has', () => {
    const built = catalog({
      tools: [brandKit, ...STUDIO_TOOLS],
      videoOptions: [slides],
    });

    expect(sections('all', '', built).tools).toEqual([
      'ai-image',
      'video:image-text-slides',
      'image-editor',
      'brand-kit',
    ]);
  });

  it('narrows both sections to the chosen chip', () => {
    expect(sections('video', '')).toEqual({
      tools: VIDEO_TOOLS,
      models: VIDEO_MODELS,
    });
    expect(sections('edit', '')).toEqual({
      tools: ['image-editor'],
      models: [],
    });
  });

  it('leaves the Models section empty under a chip with no model', () => {
    expect(sections('images', '')).toEqual({ tools: ['ai-image'], models: [] });
  });

  it.each([
    ['a name', 'kling', ['video:kling']],
    ['a description', 'narrated', ['video:image-text-slides']],
    ['a category name', 'enhance', ['image-editor']],
    ["a maker's name", 'google', ['video:veo3']],
  ])('finds a listing by %s', (_, query, ids) => {
    expect(found(query)).toEqual(ids);
  });

  it('ignores case', () => {
    expect(found('VEO')).toEqual(['video:veo3']);
  });

  it('ignores the spaces around the typed text', () => {
    expect(found(' veo ')).toEqual(['video:veo3']);
  });

  it('treats أ, إ and آ as ا, whichever is typed', () => {
    expect(found('اداة')).toEqual(['video:ad-maker']);
    expect(found('اعلانات')).toEqual(['video:ad-maker']);
    expect(found('الية')).toEqual(['video:ad-maker']);
    expect(found('أعلانات')).toEqual(['video:ad-maker']);
  });

  it('applies the chip and the typed text together', () => {
    expect(sections('all', 'image')).toEqual({
      tools: ['ai-image', 'video:image-text-slides', 'image-editor'],
      models: [],
    });
    expect(sections('video', 'image')).toEqual({
      tools: ['video:image-text-slides'],
      models: [],
    });
  });

  it("returns the chip's listings when the text is empty or only spaces", () => {
    const listings = { tools: VIDEO_TOOLS, models: VIDEO_MODELS };

    expect(sections('video', '')).toEqual(listings);
    expect(sections('video', '   ')).toEqual(listings);
  });

  it('returns both sections empty when nothing matches', () => {
    expect(sections('all', 'zzz')).toEqual({ tools: [], models: [] });
    expect(sections('images', 'google')).toEqual({ tools: [], models: [] });
  });

  // The provider list reloaded without the chosen category's last listing
  // (data-model §5).
  it('treats a chosen chip whose category is gone as All', () => {
    const view = filterStudio(catalog({ videoOptions: [] }), 'video', '', en);

    expect(view.chip).toBe('all');
    expect(sectionIds(view)).toEqual({
      tools: ['ai-image', 'image-editor'],
      models: [],
    });
  });

  it('keeps a chosen chip whose category still has listings', () => {
    expect(filterStudio(twelve, 'video', '', en).chip).toBe('video');
  });

  it.each(twelve.listings.map((tool) => ({ id: tool.entry.id, tool })))(
    'reaches $id with one chip and with one search',
    ({ tool }) => {
      const byChip = filterStudio(twelve, tool.entry.category, '', en);
      const byName = filterStudio(twelve, 'all', tool.entry.name(en), en);

      expect([...byChip.tools, ...byChip.models]).toContain(tool);
      expect([...byName.tools, ...byName.models]).toContain(tool);
    }
  );
});

describe("the fixed tools' pictures ship with the app", () => {
  // Shipped with the app, never fetched from a third party (FR-018, SC-002).
  const PUBLIC = path.join(__dirname, '../../../public');

  it.each(STUDIO_TOOLS.map((entry) => [entry.id, entry.cover]))(
    "%s's cover is under apps/frontend/public",
    (_, cover) => {
      expect(cover).toBeDefined();
      expect(fs.existsSync(path.join(PUBLIC, cover ?? ''))).toBe(true);
    }
  );
});

describe('what reaches a post', () => {
  const toolProps = {
    layout: 'stacked',
    destination: 'composer',
    onChange: jest.fn(),
  } as unknown as Parameters<NonNullable<StudioToolEntry['post']>['panel']>[0];

  const panel = (entry: StudioToolEntry | undefined) =>
    entry?.post?.panel(toolProps) as ReactElement<Record<string, any>>;

  const postEntry = (id: string, kind: 'image' | 'video'): StudioToolEntry => ({
    id,
    slug: id,
    kind: 'tool',
    category: kind === 'image' ? 'images' : 'video',
    name: () => id,
    description: () => id,
    icon: null,
    entitled: () => true,
    post: { kind, panel: () => null },
  });

  it('ai-image hands a post an image and renders the AI image tool', () => {
    const entry = listing(catalog(), 'ai-image');

    expect(entry?.post?.kind).toBe('image');
    expect(panel(entry).type).toBe(AiImageTool);
    expect(panel(entry).props).toEqual(toolProps);
  });

  it('every video type hands a post a video, paged or not', () => {
    [true, false].forEach((paged) => {
      const entry = videoTool(veo3, paged);

      expect(entry.post?.kind).toBe('video');
      expect(panel(entry).type).toBe(AiVideoTool);
      expect(panel(entry).props).toEqual({ type: veo3, ...toolProps });
    });
  });

  it('the image editor reaches no post', () => {
    expect(listing(catalog(), 'image-editor')?.post).toBeUndefined();
  });

  it('inPostCatalog keeps entitled post tools of the accepted kinds in Studio order', () => {
    const built = catalog();

    expect(
      inPostCatalog(built, ['image', 'video']).listings.map(
        ({ entry }) => entry.id
      )
    ).toEqual(['ai-image', 'video:veo3', 'video:image-text-slides']);

    const images = inPostCatalog(built, ['image']);
    expect(images.listings.map(({ entry }) => entry.id)).toEqual(['ai-image']);
    expect(images.chips.map((chip) => [chip.id, chip.count])).toEqual([
      ['all', 1],
      ['images', 1],
    ]);
    expect(images.empty).toBe(false);
    expect(images.hasLockedTools).toBe(false);

    const locked = inPostCatalog(catalog({ user: withoutAi }), [
      'image',
      'video',
    ]);
    expect(locked.listings).toEqual([]);
    expect(locked.empty).toBe(true);
    expect(locked.hasLockedTools).toBe(false);
  });

  it("a tool added to the catalog with a post field reaches the composer's list with no other change", () => {
    const added = postEntry('brand-new', 'image');
    const built = catalog({ tools: [...STUDIO_TOOLS, added] });

    expect(
      inPostCatalog(built, ['image']).listings.map(({ entry }) => entry.id)
    ).toContain('brand-new');
  });

  it("AI_IMAGE_TOOL is the AI image generator's id", () => {
    expect(AI_IMAGE_TOOL).toBe('ai-image');
    expect(listing(catalog(), AI_IMAGE_TOOL)).toBeDefined();
  });
});
