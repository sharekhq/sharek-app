import { FC, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { Calendar, TimeInput } from '@mantine/dates';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@gitroom/react/form/button';
import { isUSCitizen } from './isuscitizen.utils';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  newDayjs,
  toPickerDate,
} from '@gitroom/frontend/components/layout/set.timezone';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DropdownArrowIcon,
} from '@gitroom/frontend/components/ui/icons';

// one part of the time in the sheet, typed or stepped with the arrows
const TimeField: FC<{
  value: number;
  min: number;
  max: number;
  pad?: boolean;
  label: string;
  increaseLabel: string;
  decreaseLabel: string;
  onChange: (value: number) => void;
}> = ({
  value,
  min,
  max,
  pad,
  label,
  increaseLabel,
  decreaseLabel,
  onChange,
}) => {
  const [text, setText] = useState<string | null>(null);
  const format = (num: number) =>
    pad ? String(num).padStart(2, '0') : String(num);
  const step = (delta: number) => () => {
    const range = max - min + 1;
    onChange(((value - min + delta + range) % range) + min);
  };
  const stepper =
    'w-[44px] h-[44px] flex justify-center items-center rounded-[8px] focus-visible:ring-2 focus-visible:ring-brand';

  return (
    <div className="w-[74px] min-w-[56px] flex flex-col items-center gap-[4px] text-muted">
      <button
        type="button"
        onClick={step(1)}
        aria-label={increaseLabel}
        className={stepper}
      >
        <DropdownArrowIcon rotated={true} />
      </button>
      <input
        value={text ?? format(value)}
        placeholder={format(value)}
        aria-label={label}
        inputMode="numeric"
        maxLength={2}
        onFocus={() => setText('')}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
        onBlur={() => {
          const num = parseInt(text || '', 10);
          if (!isNaN(num)) {
            onChange(Math.min(max, Math.max(min, num)));
          }
          setText(null);
        }}
        className="w-full h-[52px] rounded-[10px] border border-line focus:border-brand bg-newBgColorInner text-center text-[14px] text-textColor outline-none"
      />
      <button
        type="button"
        onClick={step(-1)}
        aria-label={decreaseLabel}
        className={stepper}
      >
        <DropdownArrowIcon />
      </button>
    </div>
  );
};

// the calendar and the time, in the desktop popover or in the sheet at 1025px
// and below
export const DatePickerPanel: FC<{
  date: dayjs.Dayjs;
  onChange: (day: dayjs.Dayjs) => void;
  sheet?: boolean;
}> = (props) => {
  const { date, onChange, sheet } = props;
  const t = useT();
  const [month, setMonth] = useState(toPickerDate(date));

  // the pickers give machine-local dates, so their wall clock is read with
  // plain dayjs and then placed in the user's timezone
  const changeDate = useCallback(
    (type: 'date' | 'time') => (day: Date) => {
      onChange(
        newDayjs(
          type === 'time'
            ? date.format('YYYY-MM-DD') + ' ' + dayjs(day).format('HH:mm:ss')
            : dayjs(day).format('YYYY-MM-DD') + ' ' + date.format('HH:mm:ss')
        )
      );
    },
    [date]
  );

  const changeTime = useCallback(
    (hour: number, minute: number) => {
      onChange(
        newDayjs(
          date.format('YYYY-MM-DD') +
            ' ' +
            [hour, minute, 0].map((p) => String(p).padStart(2, '0')).join(':')
        )
      );
    },
    [date, onChange]
  );

  if (sheet) {
    const twelveHours = isUSCitizen();
    const pm = date.hour() >= 12;
    const arrow =
      'w-[44px] h-[44px] flex justify-center items-center rounded-[8px] text-muted focus-visible:ring-2 focus-visible:ring-brand';
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-[16px] mb-[12px]">
          <div className="w-[55px] text-[15px] font-[600]">
            {t('date', 'Date')}
          </div>
          <div className="flex-1 h-[52px] px-[16px] flex items-center rounded-[10px] border border-line bg-newBgColorInner text-[14px]">
            {date.format('ddd, D MMMM')}
          </div>
        </div>
        <div className="bg-panel rounded-[12px] px-[16px] py-[12px] mb-[24px]">
          <div className="flex items-center gap-[4px] mb-[8px]">
            <div className="flex-1 text-[15px] font-[600]">
              {dayjs(month).format('MMMM, YYYY')}
            </div>
            <button
              type="button"
              onClick={() =>
                setMonth(dayjs(month).subtract(1, 'month').toDate())
              }
              aria-label={t('previous_month', 'Previous month')}
              className={arrow}
            >
              <ChevronLeftIcon
                size={20}
                strokeWidth={1.8}
                className="rtl:rotate-180"
              />
            </button>
            <button
              type="button"
              onClick={() => setMonth(dayjs(month).add(1, 'month').toDate())}
              aria-label={t('next_month', 'Next month')}
              className={arrow}
            >
              <ChevronRightIcon
                size={20}
                strokeWidth={1.8}
                className="rtl:rotate-180"
              />
            </button>
          </div>
          <Calendar
            fullWidth={true}
            locale={dayjs.locale()}
            month={month}
            onMonthChange={setMonth}
            onChange={(day) => {
              setMonth(day);
              changeDate('date')(day);
            }}
            value={toPickerDate(date)}
            dayClassName={(day, modifiers) =>
              clsx(
                '!w-full !max-w-[44px] !h-[44px] !leading-[44px] !rounded-[8px] !text-[14px]',
                // the chosen day sits on the selected tile, as the current
                // menu item does; today is ringed (selected-ring: pomegranate
                // in light, ink in dark), since pomegranate text on the dark
                // panel measures 2.98:1 and the rose brandText is not used
                modifiers.selected
                  ? '!bg-selectedBg !text-selectedText !font-[600] !outline-none'
                  : modifiers.outside
                  ? '!text-muted !font-[400]'
                  : dayjs(day).isSame(toPickerDate(newDayjs()), 'day')
                  ? '!ring-1 !ring-inset !ring-selectedRing !text-ink !font-[600]'
                  : '!text-inkSoft !font-[400]'
              )
            }
            // the sheet draws its own month line and 44px arrows above
            styles={{ calendarHeader: { display: 'none' } }}
            classNames={{
              cell: '!py-[4px] !border-t-0 text-center',
              day: 'hover:bg-brandSoft',
              weekday: '!text-[13px] !font-[600] !text-muted',
              weekdayCell: '!pb-[4px] !h-[39px]',
            }}
          />
        </div>
        <div className="flex items-center gap-[16px]">
          <div className="w-[55px] text-[15px] font-[600]">
            {t('time', 'Time')}
          </div>
          <div className="flex items-center gap-[12px] min-w-0">
            {/* hours before minutes in both directions, as the date line
                reads (D-44) */}
            <div className="flex rtl:flex-row-reverse items-center gap-[4px] min-w-0">
              {twelveHours ? (
                <TimeField
                  value={date.hour() % 12 || 12}
                  min={1}
                  max={12}
                  label={t('hour', 'Hour')}
                  increaseLabel={t('increase_hours', 'Increase hours')}
                  decreaseLabel={t('decrease_hours', 'Decrease hours')}
                  onChange={(hour) =>
                    changeTime((hour % 12) + (pm ? 12 : 0), date.minute())
                  }
                />
              ) : (
                <TimeField
                  value={date.hour()}
                  min={0}
                  max={23}
                  pad={true}
                  label={t('hour', 'Hour')}
                  increaseLabel={t('increase_hours', 'Increase hours')}
                  decreaseLabel={t('decrease_hours', 'Decrease hours')}
                  onChange={(hour) => changeTime(hour, date.minute())}
                />
              )}
              <div className="text-[14px] font-[600]">:</div>
              <TimeField
                value={date.minute()}
                min={0}
                max={59}
                pad={true}
                label={t('minutes', 'Minutes')}
                increaseLabel={t('increase_minutes', 'Increase minutes')}
                decreaseLabel={t('decrease_minutes', 'Decrease minutes')}
                onChange={(minute) => changeTime(date.hour(), minute)}
              />
            </div>
            {twelveHours && (
              <div className="h-[52px] flex gap-[3px] p-[4px] rounded-[8px] border border-line bg-newBgColorInner">
                {[false, true].map((isPm) => (
                  <button
                    type="button"
                    key={String(isPm)}
                    aria-pressed={isPm === pm}
                    onClick={() =>
                      changeTime(
                        (date.hour() % 12) + (isPm ? 12 : 0),
                        date.minute()
                      )
                    }
                    className={clsx(
                      'w-[44px] h-[44px] flex justify-center items-center rounded-[6px] text-[14px] select-none focus-visible:ring-2 focus-visible:ring-brand',
                      isPm === pm
                        ? 'bg-selectedBg text-selectedText'
                        : 'text-muted'
                    )}
                  >
                    {isPm
                      ? t('pm', 'PM').toLowerCase()
                      : t('am', 'AM').toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Calendar
        onChange={changeDate('date')}
        value={toPickerDate(date)}
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
        format={isUSCitizen() ? '12' : '24'}
        // Mantine 5 lower-cases a typed or stepped half before matching it
        // against these, so an upper-case label leaves the half stuck
        amLabel={t('am', 'AM').toLowerCase()}
        pmLabel={t('pm', 'PM').toLowerCase()}
        label={t('label_pick_time', 'Pick time')}
        classNames={{
          label: 'text-textColor py-[12px]',
          input:
            'bg-sixth h-[40px] border border-tableBorder text-textColor rounded-[4px] outline-none',
          controls: '[direction:ltr]',
        }}
        defaultValue={toPickerDate(date)}
      />
    </>
  );
};

export const DatePicker: FC<{
  date: dayjs.Dayjs;
  onChange: (day: dayjs.Dayjs) => void;
  // opens a picker somewhere else instead of the popover
  onOpen?: () => void;
}> = (props) => {
  const { date, onChange, onOpen } = props;
  const [open, setOpen] = useState(false);
  const t = useT();

  const changeShow = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);
  const ref = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
  });

  // Same move as tags and repeat, minus the sizing: this row *is* the control
  // one level shallower (manage.modal.tsx:712 records the asymmetry) and its
  // h-[44px] already clears the floor, so it only needs the cursor its two
  // children were carrying for it. At 1025px and below it is the top bar's
  // date: still 44px (upstream draws 34), no outer margin, and a shorter date
  // line that truncates.
  const row =
    'px-[16px] border border-newTextColor/10 rounded-[8px] justify-center flex gap-[8px] items-center relative h-[44px] text-[15px] mobile:text-[13px] font-[600] ml-[7px] mobile:m-0 cursor-pointer select-none flex-1 mobile:min-w-0';
  const lines = (
    <>
      <div>
        <CalendarIcon />
      </div>
      <div className="mobile:hidden">
        {date.format(isUSCitizen() ? 'MM/DD/YYYY hh:mm A' : 'DD/MM/YYYY HH:mm')}
      </div>
      <div className="hidden mobile:block truncate">
        {date.format(isUSCitizen() ? 'MMM D, h:mm A' : 'D MMM, HH:mm')}
      </div>
    </>
  );

  // Opening somewhere else (the top bar's date sheet), the row is a control of
  // its own: a real button, named by the date it shows.
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={clsx(row, 'focus-visible:ring-2 focus-visible:ring-brand')}
      >
        {lines}
      </button>
    );
  }

  return (
    <div className={row} onClick={changeShow} ref={ref}>
      {lines}
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
          <DatePickerPanel date={date} onChange={onChange} />
          <Button className="mt-[12px]" onClick={changeShow}>
            {t('close', 'Close')}
          </Button>
        </div>
      )}
    </div>
  );
};
