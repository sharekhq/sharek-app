import { FC } from 'react';
import { clsx } from 'clsx';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
export const VideoOrImage: FC<{
  src: string;
  autoplay: boolean;
  isContain?: boolean;
  imageClassName?: string;
  videoClassName?: string;
  onShape?: (ratio: number) => void;
}> = (props) => {
  const { src, autoplay, isContain, imageClassName, videoClassName } = props;
  const report = (width: number, height: number) => {
    if (height > 0) props.onShape?.(width / height);
  };
  if (hasExtension(src, 'mp4')) {
    return (
      <video
        src={src}
        autoPlay={autoplay}
        className={clsx('w-full h-full', videoClassName)}
        muted={true}
        loop={true}
        onLoadedMetadata={(e) =>
          report(e.currentTarget.videoWidth, e.currentTarget.videoHeight)
        }
      />
    );
  }
  return (
    <img
      className={clsx(
        isContain ? 'object-contain' : 'object-cover',
        'w-full h-full',
        imageClassName
      )}
      src={src}
      onLoad={(e) =>
        report(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
      }
    />
  );
};
