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
import { videoTypeCard } from '@gitroom/frontend/components/videos/video.render.component';

const Polonto = dynamic(
  () => import('@gitroom/frontend/components/launches/polonto')
);

type Translate = ReturnType<typeof useT>;
type StudioUser = ReturnType<typeof useUser>;

export type StudioCategoryId = 'design' | 'ai_images' | 'ai_video';

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
  category: StudioCategoryId;
  /** Drives the AI tile treatment; the tile pairs it with ✦, never colour alone. */
  ai: boolean;
  name: (t: Translate) => string;
  description: (t: Translate) => string;
  icon: ReactNode;
  entitled: (user: StudioUser) => boolean;
  /** Renders the tool's trigger around the card; opening is the tool's own. */
  trigger: (props: StudioTriggerProps) => ReactNode;
}

export interface StudioTool {
  entry: StudioToolEntry;
  /** Unavailable never reaches here — availability filters before assembly. */
  state: 'entitled' | 'locked';
}

export interface StudioCategory {
  id: StudioCategoryId;
  label: (t: Translate) => string;
  tools: StudioTool[];
}

export interface StudioCatalog {
  /** Fixed order; a category with nothing listed is omitted. */
  categories: StudioCategory[];
  hasLockedTools: boolean;
  empty: boolean;
}

const CATEGORIES: Array<Pick<StudioCategory, 'id' | 'label'>> = [
  { id: 'design', label: (t) => t('studio_category_design', 'Design') },
  {
    id: 'ai_images',
    label: (t) => t('studio_category_ai_images', 'AI images'),
  },
  { id: 'ai_video', label: (t) => t('studio_category_ai_video', 'AI video') },
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
    category: 'design',
    ai: false,
    name: (t) => t('studio_tool_image_editor', 'Image editor'),
    description: (t) =>
      t(
        'studio_tool_image_editor_desc',
        'Design and edit images — text, your brand colors, layers.'
      ),
    icon: <ImageEditorGlyph />,
    entitled: needsAi,
    trigger: (props) => <ImageEditorTrigger {...props} />,
  },
  {
    id: 'ai-image',
    category: 'ai_images',
    ai: true,
    name: (t) => t('studio_tool_ai_image', 'AI image generator'),
    description: (t) =>
      t(
        'studio_tool_ai_image_desc',
        'Turn a written prompt into a post-ready image.'
      ),
    icon: <AiImageGlyph />,
    entitled: needsAi,
    trigger: ({ onSaved, renderTrigger }) => (
      <AiImage value="" onChange={onSaved} renderTrigger={renderTrigger} />
    ),
  },
];

/**
 * A card for one video provider the platform offers, named and described by
 * the provider's own card — the chooser's source — so a new provider appears
 * here with no Studio change. One that ships before its card does is named by
 * the endpoint title and described by the generic copy; the endpoint's own
 * description is written for the agent and never shown.
 */
export const videoTool = (type: VideoType): StudioToolEntry => {
  const card = videoTypeCard(type.identifier);
  return {
    id: `video:${type.identifier}`,
    category: 'ai_video',
    ai: true,
    name: (t) => videoTypeLabel(t, type),
    description: (t) =>
      card
        ? t(card.description.key, card.description.fallback)
        : t('studio_video_desc_generic', 'Generate a video with AI.'),
    icon: <AiVideoGlyph />,
    entitled: needsAi,
    trigger: ({ onSaved, renderTrigger }) => (
      <AiVideo
        value=""
        only={type.identifier}
        onChange={onSaved}
        renderTrigger={renderTrigger}
      />
    ),
  };
};

/**
 * Availability first, entitlement second: a tool the platform does not offer
 * is absent, and only what remains can be locked. With billing disabled nothing
 * is locked, since there is no plan to upgrade to.
 */
export const buildStudioCatalog = (params: {
  tools: StudioToolEntry[];
  videoOptions: VideoType[] | undefined;
  user: StudioUser;
  billingEnabled: boolean;
}): StudioCatalog => {
  const { tools, videoOptions, user, billingEnabled } = params;
  const listed = [...tools, ...(videoOptions ?? []).map(videoTool)];

  const categories = CATEGORIES.map((category) => ({
    ...category,
    tools: listed
      .filter((entry) => entry.category === category.id)
      .map(
        (entry): StudioTool => ({
          entry,
          state: billingEnabled && !entry.entitled(user) ? 'locked' : 'entitled',
        })
      ),
  })).filter((category) => category.tools.length > 0);

  return {
    categories,
    hasLockedTools: categories.some((category) =>
      category.tools.some((tool) => tool.state === 'locked')
    ),
    empty: categories.length === 0,
  };
};
