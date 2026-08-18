'use client';

import {
  DetailedHTMLProps,
  FC,
  forwardRef,
  SelectHTMLAttributes,
  useMemo,
} from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';
import { RegisterOptions } from 'react-hook-form/dist/types/validator';
import { TranslatedLabel } from '../translation/translated-label';

export const SelectChevron: FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    className={className}
  >
    <path
      d="M13.354 6.35378L8.35403 11.3538C8.30759 11.4003 8.25245 11.4372 8.19175 11.4623C8.13105 11.4875 8.06599 11.5004 8.00028 11.5004C7.93457 11.5004 7.86951 11.4875 7.80881 11.4623C7.74811 11.4372 7.69296 11.4003 7.64653 11.3538L2.64653 6.35378C2.55271 6.25996 2.5 6.13272 2.5 6.00003C2.5 5.86735 2.55271 5.7401 2.64653 5.64628C2.74035 5.55246 2.8676 5.49976 3.00028 5.49976C3.13296 5.49976 3.26021 5.55246 3.35403 5.64628L8.00028 10.2932L12.6465 5.64628C12.693 5.59983 12.7481 5.56298 12.8088 5.53784C12.8695 5.5127 12.9346 5.49976 13.0003 5.49976C13.066 5.49976 13.131 5.5127 13.1917 5.53784C13.2524 5.56298 13.3076 5.59983 13.354 5.64628C13.4005 5.69274 13.4373 5.74789 13.4625 5.80859C13.4876 5.86928 13.5006 5.93434 13.5006 6.00003C13.5006 6.06573 13.4876 6.13079 13.4625 6.19148C13.4373 6.25218 13.4005 6.30733 13.354 6.35378Z"
      fill="currentColor"
    />
  </svg>
);

export const Select: FC<
  DetailedHTMLProps<
    SelectHTMLAttributes<HTMLSelectElement>,
    HTMLSelectElement
  > & {
    error?: any;
    extraForm?: RegisterOptions<any>;
    disableForm?: boolean;
    label: string;
    name: string;
    hideErrors?: boolean;
    translationKey?: string;
    translationParams?: Record<string, string | number>;
  }
> = forwardRef((props, ref) => {
  const {
    label,
    className,
    hideErrors,
    disableForm,
    error,
    extraForm,
    translationKey,
    translationParams,
    ...rest
  } = props;
  const form = useFormContext();
  const err = useMemo(() => {
    if (error) return error;
    if (!form || !form.formState.errors[props?.name!]) return;
    return form?.formState?.errors?.[props?.name!]?.message! as string;
  }, [form?.formState?.errors?.[props?.name!]?.message, error]);
  return (
    <div className={clsx('flex flex-col', label ? 'gap-[6px]' : '')}>
      <div className={`text-[14px]`}>
        <TranslatedLabel
          label={label}
          translationKey={translationKey}
          translationParams={translationParams}
        />
      </div>
      <div className="relative">
        <select
          ref={ref}
          {...(disableForm ? {} : form.register(props.name, extraForm))}
          className={clsx(
            // 44px and 16px under a coarse pointer — the same two numbers as
            // input.tsx, and for the same two reasons: a finger, and iOS
            // Safari's zoom-on-focus below 16px.
            'h-[42px] coarse:h-[44px] w-full appearance-none bg-newBgColorInner ps-[16px] pe-[40px] outline-none border-newTableBorder border rounded-[8px] text-[14px] coarse:text-[16px] focus-visible:ring-2 focus-visible:ring-brand',
            className
          )}
          {...rest}
        />
        <SelectChevron className="absolute end-[16px] top-[50%] -translate-y-[50%] pointer-events-none text-muted" />
      </div>
      {!hideErrors && (
        <div className="text-error text-[12px]">{err || <>&nbsp;</>}</div>
      )}
    </div>
  );
});
