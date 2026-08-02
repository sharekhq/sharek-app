import { createContext, FC, useCallback, useContext, useEffect } from 'react';
import './providers/image-text-slides.provider';
import './providers/veo3.provider';
import { videosList } from '@gitroom/frontend/components/videos/video.wrapper';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const VideoFunctionWrapper = createContext({
  identifier: '',
});

export const useVideoFunction = () => {
  const { identifier } = useContext(VideoFunctionWrapper);
  const fetch = useFetch();

  return useCallback(
    async (funcName: string, params: any) => {
      return (
        await fetch(`/media/video/function`, {
          method: 'POST',
          body: JSON.stringify({ identifier, functionName: funcName, params }),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ).json();
    },
    [identifier]
  );
};

/**
 * Whether the provider fills the modal's action bar itself. Keeps the modal
 * free of per-provider branching: it asks the registry rather than the
 * identifier.
 */
export const videoOwnsActions = (identifier: string) =>
  !!videosList.find((v) => v.identifier === identifier)?.ownsActions;

/**
 * How the chooser should present this provider, or undefined when it declared
 * nothing. Same reason as above: the modal asks the registry, never the
 * identifier.
 */
export const videoTypeCard = (identifier: string) =>
  videosList.find((v) => v.identifier === identifier)?.card;

export const VideoWrapper: FC<{ identifier: string }> = (props) => {
  const setActivateExitButton = useLaunchStore((e) => e.setActivateExitButton);
  useEffect(() => {
    setActivateExitButton(false);
    return () => {
      setActivateExitButton(true);
    };
  }, []);

  const { identifier } = props;
  const Component = videosList.find(
    (v) => v.identifier === identifier
  )?.Component;
  if (!Component) {
    return null;
  }
  return (
    <VideoFunctionWrapper.Provider value={{ identifier }}>
      <Component />
    </VideoFunctionWrapper.Provider>
  );
};
