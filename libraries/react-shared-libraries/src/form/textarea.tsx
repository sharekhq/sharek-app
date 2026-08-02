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
      <div className={`text-[14px]`}>
        <TranslatedLabel
          label={label}
          translationKey={translationKey}
          translationParams={translationParams}
        />
      </div>
      <textarea
        {...(disableForm ? {} : form.register(props.name))}
        className={clsx(
          'bg-newBgColorInner min-h-[150px] p-[16px] outline-none border-newTableBorder border rounded-[8px] text-textColor',
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
