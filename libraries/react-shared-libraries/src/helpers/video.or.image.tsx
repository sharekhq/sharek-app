import { FC } from 'react';
import { clsx } from 'clsx';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export type PendingKind = 'image' | 'video';
/** The path a preview holds for a result still being made for the post. */
export const pendingMediaPath = (kind: PendingKind) => `pending:${kind}`;
export const isPendingMediaPath = (path: string) =>
  (['image', 'video'] as const).find((kind) => path === pendingMediaPath(kind));
/** The media a preview holds for a result still being made for the post. */
export const pendingPreviewMedia = (entry: {
  id: string;
  kind: PendingKind;
}) => ({
  id: entry.id,
  path: pendingMediaPath(entry.kind),
});
// A component of its own, so only a pending path calls the hook: the public
// preview page renders VideoOrImage as a server component.
const PendingMedia: FC<{ kind: PendingKind }> = ({ kind }) => {
  const t = useT();
  return (
    <div
      aria-busy="true"
      onClick={(e) => e.preventDefault()}
      className="w-full h-full bg-surface2 motion-safe:animate-pulse flex flex-col items-center justify-center gap-[8px] p-[8px] text-center text-[14px] font-[600] leading-[1.4] text-ink"
    >
      <div className="flex-none w-[20px] h-[20px] rounded-full border-2 border-brand border-t-transparent motion-safe:animate-spin" />
      {kind === 'image'
        ? t('creating_your_image', 'Creating your image…')
        : t('creating_your_video', 'Creating your video…')}
    </div>
  );
};
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
  const pending = isPendingMediaPath(src);
  if (pending) {
    return <PendingMedia kind={pending} />;
  }
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
