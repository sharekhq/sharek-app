import { FC, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { Calendar, TimeInput } from '@mantine/dates';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@gitroom/react/form/button';
import { isUSCitizen } from './isuscitizen.utils';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { CalendarIcon } from '@gitroom/frontend/components/ui/icons';

export const DatePicker: FC<{
  date: dayjs.Dayjs;
  onChange: (day: dayjs.Dayjs) => void;
}> = (props) => {
  const { date, onChange } = props;
  const [open, setOpen] = useState(false);
  const t = useT();

  const changeShow = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);
  const ref = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
  });
  const changeDate = useCallback(
    (type: 'date' | 'time') => (day: Date) => {
      onChange(
        newDayjs(
          type === 'time'
            ? date.format('YYYY-MM-DD') + ' ' + newDayjs(day).format('HH:mm:ss')
            : newDayjs(day).format('YYYY-MM-DD') + ' ' + date.format('HH:mm:ss')
        )
      );
    },
    [date]
  );
  return (
    <div
      className="px-[16px] border border-newTextColor/10 rounded-[8px] justify-center flex gap-[8px] items-center relative h-[44px] text-[15px] font-[600] ml-[7px] select-none flex-1"
      onClick={changeShow}
      ref={ref}
    >
      <div className="cursor-pointer">
        <CalendarIcon />
      </div>
      <div className="cursor-pointer">
        {date.format(isUSCitizen() ? 'MM/DD/YYYY hh:mm A' : 'DD/MM/YYYY HH:mm')}
      </div>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          // `start-[50%]` is logical and `-translate-x-[50%]` is physical, so
          // the pair only centres in LTR: under RTL `start` resolves to
          // `right: 50%` and the negative shift moves the popover a further
          // full width the same way, off the screen. Measured in Arabic at 390
          // — the calendar spanned -255..45 in a 390 viewport, so a date could
          // not be picked at all. Flipping the shift puts it back at 45..345.
          className="animate-fadeIn absolute bottom-[100%] mb-[16px] start-[50%] -translate-x-[50%] rtl:translate-x-[50%] bg-sixth border border-tableBorder text-textColor rounded-[16px] z-[300] p-[16px] flex flex-col"
        >
          <Calendar
            onChange={changeDate('date')}
            value={date.toDate()}
            dayClassName={(date, modifiers) => {
              if (modifiers.selected) {
                return '!text-white !bg-brand !outline-none';
              }
              if (modifiers.outside) {
                return '!text-gray';
              }
              if (modifiers.weekend) {
                return '!text-brand';
              }
              return '!text-textColor';
            }}
            classNames={{
              day: 'hover:bg-brandSoft',
              calendarHeaderControl: 'text-textColor hover:bg-third',
              calendarHeaderLevel: 'text-textColor hover:bg-third', // cell: 'child:!text-textColor'
              // month/year grids use their own styles-API keys — without these
              // they fall back to Mantine's factory grey hover
              monthPickerControl: 'text-textColor hover:bg-brandSoft',
              yearPickerControl: 'text-textColor hover:bg-brandSoft',
            }}
          />
          <TimeInput
            onChange={changeDate('time')}
            label="Pick time"
            classNames={{
              label: 'text-textColor py-[12px]',
              input:
                'bg-sixth h-[40px] border border-tableBorder text-textColor rounded-[4px] outline-none',
            }}
            defaultValue={date.toDate()}
          />
          <Button className="mt-[12px]" onClick={changeShow}>
            {t('close', 'Close')}
          </Button>
        </div>
      )}
    </div>
  );
};
