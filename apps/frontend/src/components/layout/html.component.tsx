'use client';
import { FC, ReactNode, useEffect, useState } from 'react';
import { useTranslationSettings } from '@gitroom/react/translation/get.transation.service.client';

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
