'use client';

import { EventEmitter } from 'events';
import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { TopTitle } from '@gitroom/frontend/components/launches/helpers/top.title.component';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { formatDuration } from '@gitroom/helpers/utils/format.duration';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  DesignMediaIcon,
  InsertMediaIcon,
} from '@gitroom/frontend/components/ui/icons';
const postUrlEmitter = new EventEmitter();

// The frame being picked should be as large as the modal allows; the stage is
// sized from this and the clip's own ratio so nothing pillarboxes.
const STAGE_HEIGHT = 'min(400px, 46vh)';

export const MediaSettingsLayout = () => {
  const [showPostSelector, setShowPostSelector] = useState(false);
  const [media, setMedia] = useState(undefined);
  const [callback, setCallback] = useState<{
    callback: (tag: {
      id: string;
      name: string;
      path: string;
      thumbnail: string;
      alt: string;
    }) => void;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  } | null>({
    callback: (params: {
      id: string;
      name: string;
      path: string;
      thumbnail: string;
      alt: string;
    }) => {},
  } as any);
  useEffect(() => {
    postUrlEmitter.on(
      'show',
      (params: {
        media: any;
        callback: (url: {
          id: string;
          name: string;
          path: string;
          thumbnail: string;
          alt: string;
        }) => void;
      }) => {
        setCallback(params);
        setMedia(params.media);
        setShowPostSelector(true);
      }
    );
    return () => {
      setShowPostSelector(false);
      setCallback(null);
      setMedia(undefined);
      postUrlEmitter.removeAllListeners();
    };
  }, []);
  const close = useCallback(() => {
    setShowPostSelector(false);
    setCallback(null);
    setMedia(undefined);
  }, []);
  if (!showPostSelector) {
    return <></>;
  }
  return (
    <MediaComponentInner
      media={media}
      onClose={close}
      onSelect={callback?.callback!}
    />
  );
};

export const useMediaSettings = () => {
  return useCallback((media: any) => {
    return new Promise((resolve) => {
      postUrlEmitter.emit('show', {
        media,
        callback: (value: any) => {
          resolve(value);
        },
      });
    });
  }, []);
};

export const CreateThumbnail: FC<{
  onSelect: (blob: Blob, timestampMs: number) => void;
  onBack: () => void;
  media:
    | {
        id: string;
        name: string;
        path: string;
        thumbnail?: string;
        alt?: string;
      }
    | undefined;
}> = (props) => {
  const { onSelect, onBack, media } = props;
  const t = useT();
  const { backendUrl } = useVariables();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setDuration(video.duration);
    if (video.videoWidth && video.videoHeight) {
      setAspectRatio(video.videoWidth / video.videoHeight);
    }
    setIsLoaded(true);
  }, []);

  // The slider owns the playhead. The element never plays here, so every
  // `timeupdate` is only an echo of a seek we asked for — writing it back
  // fights the drag, and pins the thumb to 0 whenever a seek is refused.
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    setCurrentTime(time);
  }, []);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    setIsCapturing(true);

    try {
      // The seek the slider started may still be in flight; drawing now would
      // burn the previous frame while reporting the new timestamp.
      if (video.seeking) {
        await new Promise<void>((resolve) => {
          video.addEventListener('seeked', () => resolve(), { once: true });
        });
      }

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setIsCapturing(false);
        return;
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get timestamp in milliseconds
      const timestampMs = Math.round(currentTime * 1000);

      // Convert canvas to blob
      canvas.toBlob(
        (blob: Blob | null) => {
          if (blob) {
            onSelect(blob, timestampMs);
          }
          setIsCapturing(false);
        },
        'image/jpeg',
        0.8
      );
    } catch (error) {
      console.error('Error capturing frame:', error);
      setIsCapturing(false);
      alert(
        'Unable to capture frame. This might be due to CORS restrictions on the video source.'
      );
    }
  }, [onSelect, currentTime]);

  if (!media) return null;

  return (
    <div className="flex flex-col space-y-4">
      <div
        className="relative bg-black rounded-[8px] overflow-hidden mx-auto"
        style={
          aspectRatio
            ? {
                aspectRatio,
                width: `calc(${STAGE_HEIGHT} * ${aspectRatio})`,
                maxWidth: '100%',
              }
            : { height: STAGE_HEIGHT, width: '100%' }
        }
      >
        <video
          ref={videoRef}
          src={
            backendUrl + '/public/stream?url=' + encodeURIComponent(media.path)
          }
          className="w-full h-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          muted
          preload="metadata"
          crossOrigin="anonymous"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {isLoaded && (
        <div className="flex flex-col space-y-2">
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-fifth rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, var(--brand) 0%, var(--brand) ${
                (currentTime / duration) * 100
              }%, var(--line) ${(currentTime / duration) * 100}%, var(--line) 100%)`,
            }}
          />
          <div className="flex justify-between text-[13px] text-muted">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-[12px] !mt-[20px]">
        <Button
          variant="quiet"
          className="flex-1"
          innerClassName="gap-[8px]"
          onClick={onBack}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="rtl:rotate-180"
          >
            <path
              d="M19 12H5M12 19L5 12L12 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t('back', 'Back')}
        </Button>
        <Button
          className="flex-1"
          onClick={captureFrame}
          loading={isCapturing}
          disabled={!isLoaded}
        >
          {t('select_this_frame', 'Select this frame')}
        </Button>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--brand);
          cursor: pointer;
          border: 2px solid var(--surface);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--brand);
          cursor: pointer;
          border: 2px solid var(--surface);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
};

export const MediaComponentInner: FC<{
  onClose: () => void;
  onSelect: (media: {
    id: string;
    name: string;
    path: string;
    thumbnail: string;
    alt: string;
  }) => void;
  media:
    | {
        id: string;
        name: string;
        path: string;
        thumbnail: string;
        alt: string;
        thumbnailTimestamp?: number;
      }
    | undefined;
}> = (props) => {
  const { onClose, onSelect, media } = props;
  const t = useT();
  const setActivateExitButton = useLaunchStore((e) => e.setActivateExitButton);
  const newFetch = useFetch();
  const [newThumbnail, setNewThumbnail] = useState<string | null>(null);
  const [isEditingThumbnail, setIsEditingThumbnail] = useState(false);
  const [altText, setAltText] = useState<string>(media?.alt || '');
  const [loading, setLoading] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(
    props.media?.thumbnail || null
  );
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState<number | null>(
    props.media?.thumbnailTimestamp || null
  );

  useEffect(() => {
    setActivateExitButton(false);
    return () => {
      setActivateExitButton(true);
    };
  }, []);

  const save = useCallback(async () => {
    setLoading(true);
    let path = thumbnail || '';
    if (newThumbnail) {
      const blob = await (await fetch(newThumbnail)).blob();
      const formData = new FormData();
      formData.append('file', blob, 'media.jpg');
      formData.append('preventSave', 'true');
      const data = await (
        await newFetch('/media/upload-simple', {
          method: 'POST',
          body: formData,
        })
      ).json();
      path = data.path;
    }

    const media = await (
      await newFetch('/media/information', {
        method: 'POST',
        body: JSON.stringify({
          id: props.media.id,
          alt: altText,
          thumbnail: path,
          thumbnailTimestamp: thumbnailTimestamp,
        }),
      })
    ).json();

    onSelect(media);
    onClose();
  }, [altText, newThumbnail, thumbnail, thumbnailTimestamp]);

  return (
    <div className="mt-[10px] flex flex-col gap-[20px]">
      <Input
        label="Alt text (for accessibility)"
        translationKey="alt_text_accessibility"
        name="alt"
        disableForm={true}
        removeError={true}
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        placeholder={t(
          'alt_text_placeholder',
          'Describe the image or video content…'
        )}
      />
      {hasExtension(media?.path, 'mp4') && (
        <>
          {!isEditingThumbnail ? (
            <div className="flex flex-col gap-[6px]">
              {/* Show existing thumbnail if it exists */}
              {(newThumbnail || thumbnail) && (
                <>
                  <div className="text-[14px]">
                    {t('thumbnail', 'Thumbnail')}
                  </div>
                  <img
                    src={newThumbnail || thumbnail}
                    alt={t('thumbnail', 'Thumbnail')}
                    className="max-w-full max-h-[300px] w-fit object-contain rounded-[8px]"
                  />
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-[12px] mt-[6px]">
                <Button
                  variant="quiet"
                  disabled={loading}
                  innerClassName="gap-[8px]"
                  onClick={() => setIsEditingThumbnail(true)}
                >
                  {thumbnail || newThumbnail ? (
                    <>
                      <DesignMediaIcon />
                      {t('change_frame', 'Change frame')}
                    </>
                  ) : (
                    <>
                      <InsertMediaIcon />
                      {t('create_thumbnail', 'Create thumbnail')}
                    </>
                  )}
                </Button>
                {(thumbnail || newThumbnail) && (
                  <Button
                    variant="ghost"
                    className="!text-error"
                    disabled={loading}
                    onClick={() => {
                      setNewThumbnail(null);
                      setThumbnail(null);
                    }}
                  >
                    {t('remove', 'Remove')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <CreateThumbnail
              onSelect={(blob: Blob, timestampMs: number) => {
                const url = URL.createObjectURL(blob);
                setNewThumbnail(url);
                setThumbnailTimestamp(timestampMs);
                setIsEditingThumbnail(false);
              }}
              onBack={() => setIsEditingThumbnail(false)}
              media={media}
            />
          )}
        </>
      )}

      {!isEditingThumbnail && (
        <div className="flex gap-[12px] !mt-[20px]">
          <Button
            variant="quiet"
            className="flex-1"
            disabled={loading}
            onClick={onClose}
          >
            {t('cancel', 'Cancel')}
          </Button>
          <Button className="flex-1" loading={loading} onClick={save}>
            {t('save_changes', 'Save changes')}
          </Button>
        </div>
      )}
    </div>
  );
};
