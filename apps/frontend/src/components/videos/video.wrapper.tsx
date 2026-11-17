import { FC, ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';

/**
 * A translated string declared where `t()` cannot run — the registry is module
 * scope. The modal resolves it with `t(key, fallback)`, the project's own
 * convention, so the displayed text still comes from the locale files.
 */
export interface VideoTypeText {
  key: string;
  /** English default, per `t(key, default)`. */
  fallback: string;
}

/** The company behind a model, as Studio's "by" line shows it. */
export interface StudioMaker {
  name: string;
  /** A path under `public/studio/makers/`. */
  logo?: string;
}

/**
 * How the type chooser presents a provider. Declared by the provider itself so
 * the modal can describe every type without knowing any of them (FR-004).
 */
export interface VideoTypeCard {
  name: VideoTypeText;
  description: VideoTypeText;
  /** Short facts — length, quality, what it suits. */
  pills: VideoTypeText[];
  /** Inline SVG drawn to a 52px box; inherits the AI accent from its tile. */
  diagram: ReactNode;
  /**
   * How Studio lists the provider. The provider presents itself, so Studio
   * never names a provider. The chooser (`launches/ai.video.tsx`) doesn't
   * read it.
   */
  studio?: {
    kind: 'tool' | 'model';
    /** A public path, under `public/studio/covers/`. */
    cover?: string;
    maker?: StudioMaker;
    facts?: VideoTypeText[];
    sampleLength?: string;
  };
}

/**
 * A model's line under its name, in place of the category line: who made it,
 * then its category's name, the maker's name isolated. Here, beside the card
 * it formats, so Studio and the video tool read the one helper.
 */
export const studioMakerLine = (
  t: ReturnType<typeof useT>,
  maker: StudioMaker,
  category: string | undefined
): string =>
  t('studio_model_by', 'by {{maker}} · {{category}}', {
    maker: isolate(maker.name),
    category,
    // React escapes the line, so i18next mustn't first
    interpolation: { escapeValue: false },
  });

export const videosList: {
  identifier: string;
  Component: FC;
  /** The provider fills the modal's action bar instead of the modal's own submit button. */
  ownsActions: boolean;
  /** The provider fills the stage during setup instead of the tool's own sample. */
  ownsStage: boolean;
  card?: VideoTypeCard;
}[] = [];

export const videoWrapper = (
  identifier: string,
  Component: any,
  options: {
    ownsActions?: boolean;
    ownsStage?: boolean;
    card?: VideoTypeCard;
  } = {}
): null => {
  if (videosList.map((p) => p.identifier).includes(identifier)) {
    return null;
  }

  videosList.push({
    identifier,
    Component,
    ownsActions: !!options.ownsActions,
    ownsStage: !!options.ownsStage,
    card: options.card,
  });

  return null;
};
