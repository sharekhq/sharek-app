'use client';

import { FC, ReactNode } from 'react';
import { HTML5toTouch } from 'rdndmb-html5-to-touch';
import { DndProvider } from 'react-dnd-multi-backend';
export const DNDProvider: FC<{
  children: ReactNode;
}> = ({ children }) => {
  // The HTML5toTouch pipeline registers both backends at once and switches on
  // the first touch event, so a finger can drag a post without asking what kind
  // of pointer this is before first paint, and without remounting the provider.
  return <DndProvider options={HTML5toTouch}>{children}</DndProvider>;
};
