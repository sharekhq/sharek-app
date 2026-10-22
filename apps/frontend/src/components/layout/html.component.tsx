'use client';
import { FC, ReactNode, useEffect, useState } from 'react';
import { useTranslationSettings } from '@gitroom/react/translation/get.transation.service.client';
import dayjs from 'dayjs';
import updateLocale from 'dayjs/plugin/updateLocale';
import i18next from 'i18next';
import 'dayjs/locale/ar';

// dayjs's Arabic locale calls 12:00 to 12:59 morning; take the word from the
// am/pm keys the calendar's hour labels use, so noon starts the afternoon
dayjs.extend(updateLocale);
dayjs.updateLocale('ar', {
  meridiem: (hour: number) =>
    hour < 12 ? i18next.t('am', 'AM') : i18next.t('pm', 'PM'),
});

export const HtmlComponent: FC = () => {
  const settings = useTranslationSettings();
  const [dir, setDir] = useState(settings.dir());
  const [lang, setLang] = useState(settings.resolvedLanguage);

  useEffect(() => {
    settings.on('languageChanged', (lng) => {
      setDir(settings.dir());
      setLang(lng);
    });
  }, []);

  useEffect(() => {
    const htmlElement = document.querySelector('html');
    if (htmlElement) {
      htmlElement.setAttribute('dir', dir);
      if (lang) {
        htmlElement.setAttribute('lang', lang);
      }
    }
  }, [dir, lang]);

  return null;
};
