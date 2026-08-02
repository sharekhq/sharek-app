import { FC, ReactNode } from 'react';

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
}

export const videosList: {
  identifier: string;
  Component: FC;
  /** The provider fills the modal's action bar instead of the modal's own submit button. */
  ownsActions: boolean;
  card?: VideoTypeCard;
}[] = [];

export const videoWrapper = (
  identifier: string,
  Component: any,
  options: { ownsActions?: boolean; card?: VideoTypeCard } = {}
): null => {
  if (videosList.map((p) => p.identifier).includes(identifier)) {
    return null;
  }

  videosList.push({
    identifier,
    Component,
    ownsActions: !!options.ownsActions,
    card: options.card,
  });

  return null;
};
