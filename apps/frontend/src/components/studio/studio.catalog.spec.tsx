import * as fs from 'fs';
import * as path from 'path';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
// The provider registry drags in every video provider. The rules under test
// are only what a provider's own card declares, so a registry that knows the
// two providers listed today, one whose card says nothing for Studio, and one
// more tool for the search's longer list, is enough. The two declarations of
// today mirror veo3.provider.tsx and image-text-slides.provider.tsx, whose own
// specs pin them.
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => {
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
  return {
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoTypeCard: (identifier: string) => cards[identifier],
  };
});
// The AI image window's reference row opens the Media library, which drags in
// its uploader; the catalog's rules never open the window.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
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
  buildStudioCatalog,
  filterStudio,
  STUDIO_TOOLS,
  StudioCatalog,
  StudioChip,
  StudioSections,
  StudioToolEntry,
} from '@gitroom/frontend/components/studio/studio.tools';

type CatalogInput = Parameters<typeof buildStudioCatalog>[0];
type Translate = Parameters<StudioChip['label']>[0];

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
