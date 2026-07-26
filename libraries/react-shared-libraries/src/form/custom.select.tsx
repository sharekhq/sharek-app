import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';
import { SelectChevron } from './select';

export const CustomSelect: FC<{
  error?: any;
  disableForm?: boolean;
  label: string;
  name: string;
  placeholder?: string;
  removeError?: boolean;
  onChange?: () => void;
  className?: string;
  translationKey?: string;
  translationParams?: Record<string, string | number>;
  options: Array<{
    value: string;
    label: string;
    icon?: ReactNode;
  }>;
}> = (props) => {
  const {
    options,
    onChange,
    placeholder,
    className,
    removeError,
    label,
    translationKey,
    translationParams,
    ...rest
  } = props;
  const form = useFormContext();
  const value = form.watch(props.name);
  const [isOpen, setIsOpen] = useState(false);
  const err = useMemo(() => {
    const split = (props.name + '.value').split('.');
    let errIn = form?.formState?.errors;
    for (let i = 0; i < split.length; i++) {
      // @ts-ignore
      errIn = errIn?.[split[i]];
    }
    return errIn?.message;
  }, [props.name, form]);
  const option = useMemo(() => {
    if (value?.value && options.length) {
      return (
        options.find((option) => option.value === value.value) || {
          label: placeholder,
          icon: false,
        }
      );
    }
    return {
      label: placeholder,
    };
  }, [value, options]);
  const changeOpen = useCallback(() => {
    setIsOpen(!isOpen);
  }, [isOpen]);
  const setOption = useCallback(
    (newOption: any) => (e: any) => {
      form.setValue(props.name, newOption);
      setIsOpen(false);
      e.stopPropagation();
    },
    []
  );
  useEffect(() => {
    if (onChange) {
      onChange();
    }
  }, [value]);
  return (
    <div className={clsx('flex flex-col gap-[6px] relative', className)}>
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
          'bg-input h-[44px] border-fifth border rounded-[4px] text-inputText items-center justify-center flex'
        )}
        onClick={changeOpen}
      >
        <div className="flex-1 ps-[16px] text-[14px] select-none flex gap-[8px]">
          {!!option.icon && (
            <div className="flex justify-center items-center">
              {option.icon}
            </div>
          )}

          {option.label}
        </div>
        <div className="pe-[16px] flex gap-[8px]">
          <div>
            <SelectChevron className="text-muted" />
          </div>
          {!!value && (
            <div onClick={setOption(undefined)}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-muted"
              >
                <path
                  d="M12.854 12.1463C12.9005 12.1927 12.9373 12.2479 12.9625 12.3086C12.9876 12.3693 13.0006 12.4343 13.0006 12.5C13.0006 12.5657 12.9876 12.6308 12.9625 12.6915C12.9373 12.7522 12.9005 12.8073 12.854 12.8538C12.8076 12.9002 12.7524 12.9371 12.6917 12.9622C12.631 12.9874 12.566 13.0003 12.5003 13.0003C12.4346 13.0003 12.3695 12.9874 12.3088 12.9622C12.2481 12.9371 12.193 12.9002 12.1465 12.8538L8.00028 8.70691L3.85403 12.8538C3.76021 12.9476 3.63296 13.0003 3.50028 13.0003C3.3676 13.0003 3.24035 12.9476 3.14653 12.8538C3.05271 12.76 3 12.6327 3 12.5C3 12.3674 3.05271 12.2401 3.14653 12.1463L7.2934 8.00003L3.14653 3.85378C3.05271 3.75996 3 3.63272 3 3.50003C3 3.36735 3.05271 3.2401 3.14653 3.14628C3.24035 3.05246 3.3676 2.99976 3.50028 2.99976C3.63296 2.99976 3.76021 3.05246 3.85403 3.14628L8.00028 7.29316L12.1465 3.14628C12.2403 3.05246 12.3676 2.99976 12.5003 2.99976C12.633 2.99976 12.7602 3.05246 12.854 3.14628C12.9478 3.2401 13.0006 3.36735 13.0006 3.50003C13.0006 3.63272 12.9478 3.75996 12.854 3.85378L8.70715 8.00003L12.854 12.1463Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          )}
        </div>
      </div>
      {isOpen && (
        <div
          className={clsx(
            label && !removeError && '-mt-[23px]',
            'z-[100] absolute w-full top-[100%] start-0 flex items-center rounded-bl-[4px] rounded-br-[4px] flex-col bg-fifth gap-[1px] border-l border-r border-b border-fifth overflow-hidden'
          )}
        >
          {options.map((option) => (
            <div
              key={option.value}
              onClick={setOption(option)}
              className="px-[16px] py-[8px] bg-input w-full flex gap-[8px] hover:bg-surface2 select-none cursor-pointer"
            >
              {!!option.icon && (
                <div className="flex justify-center items-center">
                  {option.icon}
                </div>
              )}
              <div className="flex-1 text-[14px]">{option.label}</div>
            </div>
          ))}
        </div>
      )}
      {!removeError && (
        <div className="text-error text-[12px]">
          {(err as any) || <>&nbsp;</>}
        </div>
      )}
    </div>
  );
};
