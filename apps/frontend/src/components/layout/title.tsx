'use client';

import { usePathname } from 'next/navigation';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  // Not memoised on the path: the names are translated, so they change without it.
  // Memoising on the menu instead would recompute every render anyway, since the
  // menu is rebuilt on each call, which is all a find over a dozen entries costs.
  const currentTitle = menuItems.find(
    (item) => path.indexOf(item.path) > -1
  )?.name;

  return <h1>{currentTitle}</h1>;
};
