'use client';

import { FC, useCallback, useEffect } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import {
  pickAttribution,
  readAttribution,
} from '@gitroom/nestjs-libraries/track/attribution';

const ATTRIBUTION_STORAGE_KEY = 'attribution';

const UtmSaver: FC = () => {
  // Nothing is reported on the return from checkout (`?check=`): the payment
  // webhook reports the trial, and a report from here would count it twice.

  // The first arrival wins: a later visit with other parameters keeps the
  // stored set. Read raw, since the storage hook only loads in an effect.
  useEffect(() => {
    if (localStorage.getItem(ATTRIBUTION_STORAGE_KEY) !== null) {
      return;
    }

    localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(
        readAttribution(
          new URLSearchParams(window.location.search),
          document.referrer,
          window.location.href
        )
      )
    );
  }, []);

  return <></>;
};

export const useAttribution = () => {
  const [value] = useLocalStorage<unknown>({
    key: ATTRIBUTION_STORAGE_KEY,
    defaultValue: {},
  });
  return pickAttribution(value);
};

export const useUtmUrl = () => {
  return useAttribution().utm_source || '';
};
export default UtmSaver;
