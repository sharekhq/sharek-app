'use client';

import {
  DetailedHTMLProps,
  FC,
  InputHTMLAttributes,
  ReactNode,
  useMemo,
} from 'react';
import clsx from 'clsx';
import { useFormContext } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';

export const Textarea: FC<
  DetailedHTMLProps<
    InputHTMLAttributes<HTMLTextAreaElement>,
    HTMLTextAreaElement
  > & {
    error?: any;
    disableForm?: boolean;
    label: string;
    name: string;
    translationKey?: string;
    translationParams?: Record<string, string | number>;
    /**
     * Stands in the error's place while there is no error, so a requirement can
     * be shown before the click and be replaced in place afterwards.
     */
    hint?: ReactNode;
    /** Sits at the end of that same line in both states — a character counter. */
    counter?: ReactNode;
    /**
     * Extra classes on the label. Opt-in rather than a new default, so a
     * caller can weight its label to match the section labels around it
     * without restyling every other form in the app.
     */
    labelClassName?: string;
  }
> = (props) => {
  const {
    label,
    className,
    disableForm,
    error,
    translationKey,
    translationParams,
    hint,
    counter,
    labelClassName,
    ...rest
  } = props;
  const form = useFormContext();
  const err = useMemo(() => {
    if (error) return error;
    if (!form || !form.formState.errors[props?.name!]) return;
    return form?.formState?.errors?.[props?.name!]?.message! as string;
  }, [form?.formState?.errors?.[props?.name!]?.message, error]);
  return (
    <div
      className={clsx(
        'flex flex-col gap-[6px]',
        props.disabled && 'opacity-50'
      )}
    >
      <div className={clsx('text-[14px]', labelClassName)}>
        <TranslatedLabel
          label={label}
          translationKey={translationKey}
          translationParams={translationParams}
        />
      </div>
      <textarea
        {...(disableForm ? {} : form.register(props.name))}
        className={clsx(
          // Height is never the problem on a textarea; the type size is —
          // below 16px iOS Safari zooms the page the moment it is focused.
          'bg-newBgColorInner min-h-[150px] p-[16px] outline-none border-newTableBorder border rounded-[8px] text-textColor coarse:text-[16px] focus-visible:ring-2 focus-visible:ring-brand',
          className
        )}
        {...rest}
      />
      <div className="text-[12px] flex items-baseline justify-between gap-[10px]">
        <span className={clsx(err ? 'text-error' : 'text-muted')}>
          {err || hint || <>&nbsp;</>}
        </span>
        {counter}
      </div>
    </div>
  );
};
