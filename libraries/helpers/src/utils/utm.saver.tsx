'use client';

import { FC, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@mantine/hooks';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import {
  pickAttribution,
  readAttribution,
} from '@gitroom/nestjs-libraries/track/attribution';
import { useTrack } from '@gitroom/react/helpers/use.track';

const ATTRIBUTION_STORAGE_KEY = 'attribution';

const UtmSaver: FC = () => {
  const searchParams = useSearchParams();
  const track = useTrack();

  useEffect(() => {
    if (searchParams.get('check')) {
      track(TrackEnum.StartTrial);
    }
  }, []);

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
