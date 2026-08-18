'use client';

import {
  DetailedHTMLProps,
  FC,
  InputHTMLAttributes,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { clsx } from 'clsx';
import { useFormContext, useWatch } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';

export const Input: FC<
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
    removeError?: boolean;
    error?: any;
    disableForm?: boolean;
    customUpdate?: () => void;
    label: string;
    name: string;
    icon?: ReactNode;
    translationKey?: string;
    translationParams?: Record<string, string | number>;
  }
> = (props) => {
  const {
    label,
    icon,
    removeError,
    customUpdate,
    className,
    disableForm,
    error,
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
  const watch = customUpdate ? form?.watch(props.name) : null;
  useEffect(() => {
    if (customUpdate) {
      customUpdate();
    }
  }, [watch]);
  return (
    <div className="flex flex-col gap-[6px]">
      {!!label && (
        <div className={`text-[14px]`}>
          <TranslatedLabel
            label={label}
            translationKey={translationKey}
            translationParams={translationParams}
          />
        </div>
      )}
      <div
        className={clsx(
          // The ring sits on the frame because the frame is what reads as the
          // field; `has-[:focus-visible]` keeps it to keyboard focus, so a
          // mouse user sees exactly what they saw before.
          'bg-newBgColorInner h-[42px] coarse:h-[44px] border-newTableBorder border rounded-[8px] text-textColor flex items-center justify-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand',
          className
        )}
      >
        {icon && <div className="ps-[16px]">{icon}</div>}
        <input
          // 16px under a coarse pointer is not a type choice: below it, iOS
          // Safari zooms the page on focus and leaves the user panning a
          // layout that was fitting a moment earlier. The 14px desktop tier
          // is untouched.
          className={clsx(
            'h-full bg-transparent outline-none flex-1 text-[14px] coarse:text-[16px] text-textColor',
            icon ? 'pl-[8px] pe-[16px]' : 'px-[16px]'
          )}
          {...(disableForm ? {} : form.register(props.name))}
          {...rest}
        />
      </div>
      {!removeError && (
        <div className="text-error text-[12px]">{err || <>&nbsp;</>}</div>
      )}
    </div>
  );
};
