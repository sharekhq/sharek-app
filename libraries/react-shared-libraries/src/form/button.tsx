'use client';

import {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  FC,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clsx } from 'clsx';
const ReactLoading = ({ color = '#fff', width = 20, height = 20 }: { type?: string; color?: string; width?: number; height?: number }) => {
  const size = Math.min(width, height);
  const borderWidth = Math.max(2, Math.round(size / 8));
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid transparent`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
};
export const Button: FC<
  DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > & {
    secondary?: boolean;
    loading?: boolean;
    innerClassName?: string;
    variant?: 'primary' | 'quiet' | 'ghost' | 'danger' | 'ai';
  }
> = ({ children, loading, innerClassName, secondary, variant, ...props }) => {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    setHeight(ref.current?.offsetHeight || 40);
  }, []);
  const variantClass = {
    primary: 'bg-brand text-white',
    quiet: 'bg-quiet text-ink border border-line',
    ghost: 'bg-transparent text-ink border border-line',
    danger: 'bg-error text-white',
    ai: 'bg-aiSoft text-aiAccent',
  }[variant || 'primary'];
  return (
    <button
      {...props}
      type={props.type || 'button'}
      ref={ref}
      className={clsx(
        (props.disabled || loading) && 'opacity-50 pointer-events-none',
        `${
          // legacy `secondary` used to paint bg-third = the modal's own
          // background (invisible button); it now means the ghost style
          secondary ? 'bg-transparent text-ink border border-line' : variantClass
        } px-[24px] h-[40px] coarse:h-[44px] rounded-[8px] cursor-pointer items-center justify-center flex relative focus-visible:ring-2 focus-visible:ring-brand`,
        props?.className
      )}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ReactLoading
            type="spin"
            color="currentColor"
            width={height! / 2}
            height={height! / 2}
          />
        </div>
      )}
      <div
        className={clsx(
          innerClassName,
          'flex-1 items-center justify-center flex',
          loading && 'invisible'
        )}
      >
        {children}
      </div>
    </button>
  );
};
