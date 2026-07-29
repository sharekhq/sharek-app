import { createContext, useContext } from 'react';

export const VideoContextWrapper = createContext<{
  value: string;
  output: 'vertical' | 'horizontal';
  onMedia: (media: { id: string; path: string }) => void;
  close: () => void;
}>({
  value: '',
  output: 'vertical',
  onMedia: () => undefined,
  close: () => undefined,
});

export const useVideo = () => useContext(VideoContextWrapper);
