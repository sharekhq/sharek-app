'use client';
import { FC, ReactNode, useEffect, useState } from 'react';
import { useTranslationSettings } from '@gitroom/react/translation/get.transation.service.client';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/he';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/pt';
import 'dayjs/locale/de';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ar';
import 'dayjs/locale/tr';
import 'dayjs/locale/vi';
import updateLocale from 'dayjs/plugin/updateLocale';
import i18next from 'i18next';

// dayjs's Arabic locale calls 12:00 to 12:59 morning; take the word from the
// am/pm keys the calendar's hour labels use, so noon starts the afternoon
dayjs.extend(updateLocale);
dayjs.updateLocale('ar', {
  meridiem: (hour: number) =>
    hour < 12 ? i18next.t('am', 'AM') : i18next.t('pm', 'PM'),
});

// Initialize language
const updateDayjsLocale = () => {
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);
};

// Set dayjs locale whenever i18next language changes
i18next.on('languageChanged', () => {
  updateDayjsLocale();
});

// Initial setup
updateDayjsLocale();

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
