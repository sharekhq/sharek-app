import { FC } from 'react';
import clsx from 'clsx';

type CreationMethod = 'UNKNOWN' | 'WEB' | 'API' | 'MCP' | 'AUTOPOST' | 'CLI';

interface Props {
  creationMethod?: CreationMethod | string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  ringColor?: string;
}

const tooltipFor = (m: string) =>
  m === 'AUTOPOST' ? 'Auto-posted by system' : `Created via ${m}`;

export const CreationMethodBadge: FC<Props> = ({
  creationMethod,
  size = 'xs',
  className,
  ringColor,
}) => {
  if (!creationMethod || creationMethod === 'UNKNOWN') return null;

  const sizeClasses =
    size === 'xs'
      ? 'h-[12px] px-[4px] text-[7px]'
      : size === 'md'
      ? 'h-[22px] px-[10px] text-[12px]'
      : 'h-[18px] px-[8px] text-[10px]';

  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center rounded-full font-bold uppercase tracking-wide leading-none cursor-default',
        sizeClasses,
        creationMethod === 'WEB' && 'bg-surface2 text-muted',
        creationMethod === 'API' && 'bg-catLapis text-white',
        creationMethod === 'MCP' && 'bg-catFayrouz text-white',
        creationMethod === 'AUTOPOST' && 'bg-catSaffron text-white',
        creationMethod === 'CLI' && 'bg-catPalm text-white',
        className
      )}
      style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined}
      data-tooltip-id="tooltip"
      data-tooltip-content={tooltipFor(creationMethod)}
    >
      {creationMethod}
    </div>
  );
};
