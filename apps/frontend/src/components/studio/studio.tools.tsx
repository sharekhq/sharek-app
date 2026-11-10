'use client';

import dynamic from 'next/dynamic';
import { FC, ReactNode, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import {
  AiVideo,
  Media,
  VideoType,
  videoTypeLabel,
} from '@gitroom/frontend/components/launches/ai.video';
import { matchesSearch } from '@gitroom/frontend/components/launches/channel.panel';
import { videoTypeCard } from '@gitroom/frontend/components/videos/video.render.component';
import type { StudioMaker } from '@gitroom/frontend/components/videos/video.wrapper';

const Polonto = dynamic(
  () => import('@gitroom/frontend/components/launches/polonto')
);

type Translate = ReturnType<typeof useT>;
type StudioUser = ReturnType<typeof useUser>;

export type StudioCategoryId = 'images' | 'video' | 'edit' | 'branding';

export interface StudioTriggerProps {
  onSaved: (media: Media) => void;
  /** The card, rendered as the tool's own trigger. */
  renderTrigger: (open: () => void, loading: boolean) => ReactNode;
}

/**
 * Opens the Polotno editor the way the composer's Design Media button does
 * (media.component.tsx); the editor's own save is what lands the design in
 * the Media library.
 */
const ImageEditorTrigger: FC<StudioTriggerProps> = ({
  onSaved,
  renderTrigger,
}) => {
  const t = useT();
  const { openModal } = useModals();

  const open = useCallback(() => {
    openModal({
      askClose: false,
      title: t('design_media', 'Design Media'),
      size: '80%',
      children: (close) => (
        <Polonto
          setMedia={(media) => media.forEach(onSaved)}
          closeModal={close}
        />
      ),
    });
  }, [openModal, onSaved, t]);

  return <>{renderTrigger(open, false)}</>;
};

/**
 * One launchable creation tool. Text is resolved with `t(key, fallback)` at
 * render time, the way the video registry's cards are, because the registry
 * is module scope where `t()` cannot run.
 */
export interface StudioToolEntry {
  id: string;
  /** A tool is made for one job; a model is an AI model the member drives. */
  kind: 'tool' | 'model';
  category: StudioCategoryId;
  name: (t: Translate) => string;
  description: (t: Translate) => string;
  /** A public path, under `public/studio/covers/`. Absent: the placeholder. */
  cover?: string;
  icon: ReactNode;
  /** Models only. */
  maker?: StudioMaker;
  /** Models only: two or three short facts. */
  facts?: (t: Translate) => string[];
  /** Video models only, e.g. `0:08`; not translated. */
  sampleLength?: string;
  entitled: (user: StudioUser) => boolean;
  /** Renders the tool's trigger around the card; opening is the tool's own. */
  trigger: (props: StudioTriggerProps) => ReactNode;
}

export interface StudioTool {
  entry: StudioToolEntry;
  /** Unavailable never reaches here — availability filters before assembly. */
  state: 'entitled' | 'locked';
}

export interface StudioChip {
  id: 'all' | StudioCategoryId;
  label: (t: Translate) => string;
  /** Tools and models together, over the whole catalogue. */
  count: number;
}

export interface StudioCatalog {
  /** Every listing, in registry order: the fixed tools, then the providers. */
  listings: StudioTool[];
  /** All, then each category with a listing, in fixed order. */
  chips: StudioChip[];
  hasLockedTools: boolean;
  empty: boolean;
}

export interface StudioSections {
  /** The chip in force: the chosen one, or All once its category is gone. */
  chip: StudioChip['id'];
  /** Each in category order, then registry order; either may be empty. */
  tools: StudioTool[];
  models: StudioTool[];
}

const CATEGORIES: Array<{
  id: StudioCategoryId;
  label: (t: Translate) => string;
}> = [
  { id: 'images', label: (t) => t('studio_category_images', 'Images') },
  { id: 'video', label: (t) => t('studio_category_video', 'Video') },
  { id: 'edit', label: (t) => t('studio_category_edit', 'Edit & enhance') },
  { id: 'branding', label: (t) => t('studio_category_branding', 'Branding') },
];

// The composer gates Design Media, AI Image and AI Video on this one flag
// (media.component.tsx); Studio mirrors it so no plan sees more or less than
// it does today. Declared per entry so a finer flag drops in without touching
// the catalog.
const needsAi = (user: StudioUser) => !!user?.tier?.ai;

const ImageEditorGlyph = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="30"
    height="30"
    viewBox="0 0 22 22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2.5" y="2.5" width="17" height="17" rx="2.5" />
    <circle cx="8" cy="8" r="1.8" />
    <path d="M2.5 15.5 7 11l4 4 3.5-3.5 5 5" />
  </svg>
);

const AiImageGlyph = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="30"
    height="30"
    viewBox="0 0 22 22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2.5" y="4.5" width="17" height="14" rx="2.5" />
    <circle cx="8" cy="9.5" r="1.6" />
    <path d="M2.5 15.5 7 11.5l3.5 3.5 2.5-2.5 6.5 6" />
  </svg>
);

const AiVideoGlyph = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="30"
    height="30"
    viewBox="0 0 22 22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="1.5" y="6.5" width="12.5" height="11" rx="2.5" />
    <path d="m14 10.8 6.5-3v8.4l-6.5-3" />
  </svg>
);

export const STUDIO_TOOLS: StudioToolEntry[] = [
  {
    id: 'image-editor',
    kind: 'tool',
    category: 'edit',
    name: (t) => t('studio_tool_image_editor', 'Image editor'),
    description: (t) =>
      t(
        'studio_tool_image_editor_desc',
        'Design and edit images — text, your brand colors, layers.'
      ),
    cover: '/studio/covers/image-editor.webp',
    icon: <ImageEditorGlyph />,
    entitled: needsAi,
    trigger: (props) => <ImageEditorTrigger {...props} />,
  },
  {
    id: 'ai-image',
    kind: 'tool',
    category: 'images',
    name: (t) => t('studio_tool_ai_image', 'AI image generator'),
    description: (t) =>
      t(
        'studio_tool_ai_image_desc',
        'Turn a written prompt into a post-ready image.'
      ),
    cover: '/studio/covers/ai-image.webp',
    icon: <AiImageGlyph />,
    entitled: needsAi,
    trigger: ({ onSaved, renderTrigger }) => (
      <AiImage
        value=""
        onChange={onSaved}
        renderTrigger={renderTrigger}
        destination="media"
      />
    ),
  },
];

/**
 * A card for one video provider the platform offers, named and described by
 * the provider's own card — the chooser's source — so a new provider appears
 * here with no Studio change. One that ships before its card does is named by
 * the endpoint title and described by the generic copy; the endpoint's own
 * description is written for the agent and never shown. The card's `studio`
 * part says whether it is a tool or a model and what its card shows; one that
 * declares nothing is a model with no cover.
 */
export const videoTool = (type: VideoType): StudioToolEntry => {
  const card = videoTypeCard(type.identifier);
  const studio = card?.studio;
  const facts = studio?.facts;
  return {
    id: `video:${type.identifier}`,
    kind: studio?.kind ?? 'model',
    category: 'video',
    name: (t) => videoTypeLabel(t, type),
    description: (t) =>
      card
        ? t(card.description.key, card.description.fallback)
        : t('studio_video_desc_generic', 'Generate a video with AI.'),
    cover: studio?.cover,
    icon: <AiVideoGlyph />,
    maker: studio?.maker,
    facts: facts && ((t) => facts.map((fact) => t(fact.key, fact.fallback))),
    sampleLength: studio?.sampleLength,
    entitled: needsAi,
    trigger: ({ onSaved, renderTrigger }) => (
      <AiVideo
        value=""
        only={type.identifier}
        onChange={onSaved}
        renderTrigger={renderTrigger}
        destination="media"
      />
    ),
  };
};

/**
 * Availability first, entitlement second: a tool the platform does not offer
 * is absent, and only what remains can be locked. With billing disabled nothing
 * is locked, since there is no plan to upgrade to. The image editor is offered
 * only where SHOW_IMAGE_EDITOR is set.
 */
export const buildStudioCatalog = (params: {
  tools: StudioToolEntry[];
  videoOptions: VideoType[] | undefined;
  user: StudioUser;
  billingEnabled: boolean;
  showImageEditor: boolean;
}): StudioCatalog => {
  const { tools, videoOptions, user, billingEnabled, showImageEditor } = params;
  const listings = [
    ...tools.filter((entry) => showImageEditor || entry.id !== 'image-editor'),
    ...(videoOptions ?? []).map(videoTool),
  ].map(
    (entry): StudioTool => ({
      entry,
      state: billingEnabled && !entry.entitled(user) ? 'locked' : 'entitled',
    })
  );

  const chips: StudioChip[] = [
    {
      id: 'all',
      label: (t) => t('studio_chip_all', 'All'),
      count: listings.length,
    },
    ...CATEGORIES.map((category) => ({
      ...category,
      count: listings.filter((tool) => tool.entry.category === category.id)
        .length,
    })).filter((chip) => chip.count > 0),
  ];

  return {
    listings,
    chips,
    hasLockedTools: listings.some((tool) => tool.state === 'locked'),
    empty: listings.length === 0,
  };
};

/**
 * What the page shows for a chip and a search: the listings of the chip's
 * category whose name, description, category name or maker's name holds the
 * typed text, split into Tools and Models. A chip whose category emptied when
 * the provider list reloaded counts as All.
 */
export const filterStudio = (
  catalog: StudioCatalog,
  chip: StudioChip['id'],
  query: string,
  t: Translate
): StudioSections => {
  const chosen = catalog.chips.some((item) => item.id === chip) ? chip : 'all';
  const text = query.trim();
  const shown = CATEGORIES.filter(
    (category) => chosen === 'all' || category.id === chosen
  ).flatMap((category) =>
    catalog.listings.filter(
      ({ entry }) =>
        entry.category === category.id &&
        (!text ||
          [
            entry.name(t),
            entry.description(t),
            category.label(t),
            entry.maker?.name || '',
          ].some((field) => matchesSearch(field, text)))
    )
  );

  return {
    chip: chosen,
    tools: shown.filter((tool) => tool.entry.kind === 'tool'),
    models: shown.filter((tool) => tool.entry.kind === 'model'),
  };
};
