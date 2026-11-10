'use client';
import { FC, ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

const BASE_LABEL_PX = 13;
const MIN_LABEL_PX = 10;

export const MenuItem: FC<{ label: string; icon: ReactNode; path: string; onClick?: () => void }> = ({
  label,
  icon,
  path,
  onClick,
}) => {
  const currentPath = usePathname();
  const isActive = currentPath.indexOf(path) === 0;
  const labelRef = useRef<HTMLDivElement>(null);

  // Verbose locales (de/es/it/pt) have nav labels wider than the rail; CSS
  // cannot size text to its container, so measure and shrink the overflowing
  // label (floor 10px — below that the ellipsis classes take over). Re-runs
  // on font load because Plex swaps in after first paint.
  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const scale = el.clientWidth / el.scrollWidth;
      if (scale < 1) {
        el.style.fontSize = `${Math.max(
          MIN_LABEL_PX,
          Math.floor(BASE_LABEL_PX * scale * 10) / 10
        )}px`;
      }
    };
    fit();
    document.fonts?.ready.then(fit);
  }, [label]);

  const className = clsx(
    'group w-full pt-[4px] pb-[6px] px-[4px] gap-[5px] custom:py-[2px] custom:gap-[2px] flex flex-col font-[600] items-center justify-center rounded-[12px] transition-colors focus-visible:ring-2',
    // The mark sits on the icon's tile below, so no item has a background.
    // The current item's ring has its own token: in dark its tile is
    // pomegranate, and a pomegranate ring beside it would vanish.
    isActive
      ? 'text-textItemFocused focus-visible:ring-selectedRing'
      : 'text-textItemBlur hover:text-textItemFocused focus-visible:ring-brand'
  );
  const current = isActive ? 'page' : undefined;

  const inner = (
    <>
      <div
        className={clsx(
          'flex items-center justify-center w-[40px] h-[40px] custom:w-[36px] custom:h-[36px] rounded-[12px] transition-colors',
          isActive && 'bg-selectedBg text-selectedText'
        )}
      >
        {icon}
      </div>
      <div
        ref={labelRef}
        className="text-[13px] leading-[1.1] text-center whitespace-nowrap max-w-full overflow-hidden text-ellipsis"
      >
        {label}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        title={label}
        aria-current={current}
        className={className}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      title={label}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      aria-current={current}
      className={className}
    >
      {inner}
    </Link>
  );
};
