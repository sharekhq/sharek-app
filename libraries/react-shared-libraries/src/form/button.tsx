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
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'dangerGhost'
  | 'ai';
export type ButtonSize = 'large' | 'medium' | 'small';
// The dashboard's one button set, for hand-made buttons and for <button>s left plain to keep an upstream diff small.
export const buttonClassName = ({
  variant = 'primary',
  size = 'medium',
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string =>
  clsx(
    'flex items-center justify-center gap-[6px] rounded-[8px] font-[600] cursor-pointer relative coarse:min-h-[44px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    {
      primary: 'bg-brand text-white',
      secondary: 'bg-quiet text-ink border border-line hover:bg-surface2',
      ghost: 'bg-transparent text-ink hover:bg-boxHover',
      danger: 'bg-error text-white',
      dangerGhost: 'bg-transparent text-error hover:bg-boxHover',
      ai: 'bg-aiSoft text-aiAccent border border-transparent hover:border-aiAccent',
    }[variant],
    {
      large: 'h-[44px] px-[20px] text-[14px]',
      medium: 'h-[40px] px-[16px] text-[14px]',
      small: 'h-[32px] px-[12px] text-[13px]',
    }[size]
  );
export const Button: FC<
  DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > & {
    // legacy: the same as variant="secondary"; variant wins over it
    secondary?: boolean;
    loading?: boolean;
    innerClassName?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
> = ({
  children,
  loading,
  innerClassName,
  secondary,
  variant,
  size,
  ...props
}) => {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    setHeight(ref.current?.offsetHeight || 40);
  }, []);
  return (
    <button
      {...props}
      type={props.type || 'button'}
      ref={ref}
      className={clsx(
        buttonClassName({
          variant: variant ?? (secondary ? 'secondary' : 'primary'),
          size,
        }),
        (props.disabled || loading) && 'opacity-50 pointer-events-none',
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
          'flex-1 items-center justify-center flex gap-[6px]',
          loading && 'invisible'
        )}
      >
        {children}
      </div>
    </button>
  );
};
