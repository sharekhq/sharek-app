'use client';

import { FC } from 'react';
export const VideoFrame: FC<{
  url: string;
  autoplay?: boolean;
  controls?: boolean;
  playsInline?: boolean;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
  className?: string;
}> = (props) => {
  const { url, className, onLoadedMetadata } = props;
  return (
    <video
      className={className || 'w-full h-full object-cover rounded-[4px]'}
      src={url + '#t=0.1'}
      preload="metadata"
      autoPlay={!!props?.autoplay}
      controls={!!props?.controls}
      playsInline={!!props?.playsInline}
      onLoadedMetadata={
        onLoadedMetadata ? (e) => onLoadedMetadata(e.currentTarget) : undefined
      }
    />
  );
};
