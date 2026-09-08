jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
// The provider registry drags in every video provider. The rule under test is
// only that a provider's own card names and describes its tool, so a registry
// that knows one provider is enough.
jest.mock(
  '@gitroom/frontend/components/videos/video.render.component',
  () => ({
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoTypeCard: (identifier: string) =>
      identifier === 'veo3'
        ? {
            name: { key: 'video_type_veo3', fallback: 'Veo 3' },
            description: {
              key: 'video_type_veo3_desc',
              fallback: 'One continuous live-action shot.',
            },
            pills: [],
            diagram: null,
          }
        : undefined,
  })
);

import {
  buildStudioCatalog,
  STUDIO_TOOLS,
  StudioCatalog,
  StudioCategoryId,
} from '@gitroom/frontend/components/studio/studio.tools';

// What /media/video-options answers: the agent-facing description rides along
// and must never reach a card.
const veo3 = {
  identifier: 'veo3',
  title: 'Veo3 (Audio + Video)',
  description: 'Generates a video from a prompt. Use this when the user…',
};
const slides = { identifier: 'image-text-slides', title: 'Image Text Slides' };
const unknown = {
  identifier: 'sora',
  title: 'Sora',
  description: 'Generates a video. Use this when…',
};

const withAi = { tier: { ai: true } } as any;
const withoutAi = { tier: { ai: false } } as any;

const catalog = (
  overrides: Partial<Parameters<typeof buildStudioCatalog>[0]> = {}
) =>
  buildStudioCatalog({
    tools: STUDIO_TOOLS,
    videoOptions: [veo3, slides],
    user: withAi,
    billingEnabled: true,
    ...overrides,
  });

// Resolves the way the components do — t(key, fallback) — against a locale
// stub, so a resolved key and a fallback can be told apart.
const translate = (locale: Record<string, string>) =>
  ((key: string, fallback: string) => locale[key] ?? fallback) as any;

const ids = (built: StudioCatalog) => built.categories.map((c) => c.id);
const toolsIn = (built: StudioCatalog, category: StudioCategoryId) =>
  built.categories.find((c) => c.id === category)?.tools ?? [];

describe('the fixed tools', () => {
  it('lists the image editor under Design and the AI image generator under AI images', () => {
    const built = catalog();

    expect(toolsIn(built, 'design').map((t) => t.entry.id)).toEqual([
      'image-editor',
    ]);
    expect(toolsIn(built, 'ai_images').map((t) => t.entry.id)).toEqual([
      'ai-image',
    ]);
  });

  it('marks the AI tools and only them', () => {
    const built = catalog();

    expect(toolsIn(built, 'design')[0].entry.ai).toBe(false);
    expect(toolsIn(built, 'ai_images')[0].entry.ai).toBe(true);
    expect(toolsIn(built, 'ai_video').every((t) => t.entry.ai)).toBe(true);
  });
});

describe('availability', () => {
  it('lists one video tool per provider the platform offers', () => {
    const built = catalog();

    expect(toolsIn(built, 'ai_video').map((t) => t.entry.id)).toEqual([
      'video:veo3',
      'video:image-text-slides',
    ]);
  });

  // Unavailable is not locked: a provider the platform does not offer has no
  // card at all, whatever the plan says.
  it('leaves out a provider the platform does not offer, even for a plan that could not use it', () => {
    const built = catalog({ videoOptions: [veo3], user: withoutAi });

    expect(toolsIn(built, 'ai_video').map((t) => t.entry.id)).toEqual([
      'video:veo3',
    ]);
  });

  it('omits the AI video category when no provider is offered', () => {
    expect(ids(catalog({ videoOptions: [] }))).toEqual(['design', 'ai_images']);
  });

  it('treats a list that has not loaded like an empty one', () => {
    expect(ids(catalog({ videoOptions: undefined }))).toEqual([
      'design',
      'ai_images',
    ]);
  });
});

describe('entitlement', () => {
  it('locks every tool the plan excludes when billing is enabled', () => {
    const built = catalog({ user: withoutAi });

    const states = built.categories.flatMap((c) => c.tools.map((t) => t.state));
    expect(states).toHaveLength(4);
    expect(states.every((state) => state === 'locked')).toBe(true);
    expect(built.hasLockedTools).toBe(true);
  });

  it('locks nothing on a plan that includes the tools', () => {
    const built = catalog();

    const states = built.categories.flatMap((c) => c.tools.map((t) => t.state));
    expect(states.every((state) => state === 'entitled')).toBe(true);
    expect(built.hasLockedTools).toBe(false);
  });

  it('locks nothing when billing is disabled, whatever the plan says', () => {
    const built = catalog({ user: withoutAi, billingEnabled: false });

    const states = built.categories.flatMap((c) => c.tools.map((t) => t.state));
    expect(states.every((state) => state === 'entitled')).toBe(true);
    expect(built.hasLockedTools).toBe(false);
  });
});

describe('grouping', () => {
  it('keeps the categories in their fixed order', () => {
    expect(ids(catalog())).toEqual(['design', 'ai_images', 'ai_video']);
  });

  it('is empty only when nothing at all is listed', () => {
    expect(catalog().empty).toBe(false);
    expect(catalog({ tools: [], videoOptions: [] }).empty).toBe(true);
  });

  it('labels each category through the locale', () => {
    const t = translate({ studio_category_ai_video: 'فيديو بالذكاء الاصطناعي' });
    const [design, , video] = catalog().categories;

    expect(design.label(t)).toBe('Design');
    expect(video.label(t)).toBe('فيديو بالذكاء الاصطناعي');
  });
});

describe('naming a video tool', () => {
  it("uses the provider's own name from the registry, not the endpoint title", () => {
    const [tool] = toolsIn(catalog({ videoOptions: [veo3] }), 'ai_video');

    expect(tool.entry.name(translate({}))).toBe('Veo 3');
    expect(tool.entry.name(translate({ video_type_veo3: 'Veo 3' }))).toBe(
      'Veo 3'
    );
  });

  it("uses the provider's own description from the registry", () => {
    const [tool] = toolsIn(catalog({ videoOptions: [veo3] }), 'ai_video');

    expect(
      tool.entry.description(translate({ video_type_veo3_desc: 'لقطة واحدة' }))
    ).toBe('لقطة واحدة');
  });

  // A provider that ships before its card does still gets a card here: the
  // endpoint title names it and the generic copy describes it — never the
  // paragraph the endpoint wrote for the agent.
  it('falls back to the endpoint title and the generic description for a provider without a card', () => {
    const [tool] = toolsIn(catalog({ videoOptions: [unknown] }), 'ai_video');
    const t = translate({ studio_video_desc_generic: 'أنشئ فيديو بالذكاء الاصطناعي.' });

    expect(tool.entry.name(t)).toBe('Sora');
    expect(tool.entry.description(t)).toBe('أنشئ فيديو بالذكاء الاصطناعي.');
    expect(tool.entry.description(translate({}))).not.toContain('Use this when');
  });
});
