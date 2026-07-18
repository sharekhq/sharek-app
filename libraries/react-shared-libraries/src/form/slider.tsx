'use client';

import { FC, useCallback } from 'react';
import clsx from 'clsx';
export const Slider: FC<{
  value: 'on' | 'off';
  fill?: boolean;
  onChange: (value: 'on' | 'off') => void;
}> = (props) => {
  const { value, onChange } = props;
  const change = useCallback(() => {
    onChange(value === 'on' ? 'off' : 'on');
  }, [value]);
  return (
    <div
      className={clsx(
        'w-[57px] h-[34px] p-[4px] border rounded-[100px] transition-colors',
        value === 'on' ? 'bg-brand border-brand' : 'bg-surface2 border-line'
      )}
      onClick={change}
    >
      <div className="w-full h-full relative rounded-[100px]">
        <div
          className={clsx(
            'absolute left-0 top-0 w-[24px] h-[24px] bg-white border border-line rounded-full transition-all cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.25)]',
            value === 'on' ? 'left-[100%] -translate-x-[100%]' : 'left-0'
          )}
        />
      </div>
    </div>
  );
};
