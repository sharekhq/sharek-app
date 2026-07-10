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
    'group w-full minCustom:min-h-[54px] custom:min-h-[44px] py-[8px] px-[4px] minCustom:gap-[4px] custom:gap-[2px] flex flex-col font-[600] items-center justify-center rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused transition-colors',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  const inner = (
    <>
      <div className="custom:scale-90 transition-transform">{icon}</div>
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
      <button onClick={onClick} title={label} className={className}>
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
      className={className}
    >
      {inner}
    </Link>
  );
};
