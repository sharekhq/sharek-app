import { FC } from 'react';

export const videosList: {
  identifier: string;
  Component: FC;
  /** The provider renders its own submit control instead of the modal's. */
  ownsSubmit: boolean;
}[] = [];

export const videoWrapper = (
  identifier: string,
  Component: any,
  options: { ownsSubmit?: boolean } = {}
): null => {
  if (videosList.map((p) => p.identifier).includes(identifier)) {
    return null;
  }

  videosList.push({ identifier, Component, ownsSubmit: !!options.ownsSubmit });

  return null;
};
