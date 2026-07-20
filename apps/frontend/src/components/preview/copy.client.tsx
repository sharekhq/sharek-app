'use client';

import { Button } from '@gitroom/react/form/button';
import copy from 'copy-to-clipboard';
import { useCallback } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const CopyClient = () => {
  const toast = useToaster();
  const t = useT();
  const copyToClipboard = useCallback(() => {
    toast.show(
      t('link_copied_to_clipboard', 'Link copied to clipboard'),
      'success'
    );
    copy(window.location.href.split?.('?')?.shift()!);
  }, []);
  return (
    <Button onClick={copyToClipboard} innerClassName="gap-[8px]">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
        <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19" />
      </svg>
      {t('share', 'Share')}
    </Button>
  );
};
