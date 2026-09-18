import { FC, useEffect, useState } from 'react';
import {
  Integrations,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import { PickPlatforms } from '@gitroom/frontend/components/launches/helpers/pick.platform.component';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Select } from '@gitroom/react/form/select';
import { Slider } from '@gitroom/react/form/slider';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deriveTranslationKey } from '@gitroom/react/translation/derive-key';
const delayOptions = [
  {
    name: 'Immediately',
    translationKey: 'immediately',
    value: 0,
  },
  {
    name: '1 hour',
    translationKey: '1_hour',
    value: 3600000,
  },
  {
    name: '2 hours',
    translationKey: '2_hours',
    value: 7200000,
  },
  {
    name: '3 hours',
    translationKey: '3_hours',
    value: 10800000,
  },
  {
    name: '8 hours',
    translationKey: '8_hours',
    value: 28800000,
  },
  {
    name: '12 hours',
    translationKey: '12_hours',
    value: 43200000,
  },
  {
    name: '15 hours',
    translationKey: '15_hours',
    value: 54000000,
  },
  {
    name: '24 hours',
    translationKey: '24_hours',
    value: 86400000,
  },
];
export const InternalChannels: FC<{
  plugs: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  }[];
}> = (props) => {
  const { plugs } = props;
  return (
    <div>
      {plugs.map((plug, index) => (
        <Plug plug={plug} key={index} />
      ))}
    </div>
  );
};
const PlugField: FC<{
  plugIdentifier: string;
  field: {
    name: string;
    description: string;
    type: string;
    placeholder: string;
    validation?: RegExp;
  };
}> = ({ plugIdentifier, field }) => {
  const t = useT();
  const fieldName = `plug--${plugIdentifier}--${field.name}`;
  const placeholder = t(
    deriveTranslationKey('placeholder', field.placeholder),
    field.placeholder
  );

  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.description}
        name={fieldName}
        placeholder={placeholder}
      />
    );
  }

  return (
    <Input
      label={field.description}
      name={fieldName}
      placeholder={placeholder}
    />
  );
};

const Plug: FC<{
  plug: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  };
}> = ({ plug }) => {
  const { allIntegrations, integration } = useIntegration();
  const t = useT();

  const { watch, setValue, control, register } = useSettings();
  const [load, setLoad] = useState(false);
  const val = watch(`plug--${plug.identifier}--integrations`);
  const active = watch(`plug--${plug.identifier}--active`);
  useEffect(() => {
    setTimeout(() => {
      setLoad(true);
    }, 20);
  }, []);
  const [localValue, setLocalValue] = useState<Integrations[]>(
    (val || []).map((p: any) => ({
      ...p,
    }))
  );
  useEffect(() => {
    setValue(`plug--${plug.identifier}--integrations`, [...localValue]);
  }, [localValue, plug, setValue]);
  const [allowedIntegrations] = useState(
    allIntegrations.filter(
      (i) =>
        plug.pickIntegration.includes(i.identifier) && integration?.id !== i.id
    )
  );
  if (!load) {
    return null;
  }
  return (
    <div
      key={plug.title}
      className="flex flex-col gap-[10px] border-tableBorder border p-[15px] rounded-lg"
    >
      <div className="flex items-center">
        <div className="flex-1">
          {t(deriveTranslationKey('plug', plug.title), plug.title)}
        </div>
        <div>
          <Slider
            value={active ? 'on' : 'off'}
            onChange={(p) =>
              setValue(`plug--${plug.identifier}--active`, p === 'on')
            }
            fill={true}
          />
        </div>
      </div>
      <div className="w-full max-w-[600px] overflow-y-auto pb-[10px] text-[12px] flex flex-col gap-[10px]">
        {!allowedIntegrations.length ? (
          t('no_available_accounts', 'No available accounts')
        ) : (
          <div
            className={clsx(
              'flex flex-col gap-[10px]',
              !active && 'opacity-25 pointer-events-none'
            )}
          >
            <div>
              {t(
                deriveTranslationKey('plug', plug.description),
                plug.description
              )}
            </div>
            <Select
              label="Delay"
              hideErrors={true}
              {...register(`plug--${plug.identifier}--delay`)}
            >
              {delayOptions.map((p) => (
                <option key={p.name} value={p.value}>
                  {t(p.translationKey, p.name)}
                </option>
              ))}
            </Select>
            {plug.fields.length > 0 && (
              <div className="flex flex-col gap-[10px]">
                {plug.fields.map((field) => (
                  <PlugField
                    key={field.name}
                    plugIdentifier={plug.identifier}
                    field={field}
                  />
                ))}
              </div>
            )}
            <div>
              {t('accounts_that_will_engage', 'Accounts that will engage:')}
            </div>
            <PickPlatforms
              hide={false}
              integrations={allowedIntegrations}
              selectedIntegrations={localValue}
              singleSelect={false}
              isMain={true}
              onChange={setLocalValue}
            />
          </div>
        )}
      </div>
    </div>
  );
};
