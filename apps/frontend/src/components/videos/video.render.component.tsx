import { createContext, FC, useCallback, useContext } from 'react';
import './providers/image-text-slides.provider';
import './providers/veo3.provider';
import { videosList } from '@gitroom/frontend/components/videos/video.wrapper';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

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
 * Whether the provider fills the stage itself during setup, in place of the
 * tool's sample (a workflow's storyboard). Asked of the registry for the same
 * reason.
 */
export const videoOwnsStage = (identifier: string) =>
  !!videosList.find((v) => v.identifier === identifier)?.ownsStage;

/**
 * How this provider presents itself, or undefined when it declared
 * nothing. Same reason as above: the modal asks the registry, never the
 * identifier.
 */
export const videoTypeCard = (identifier: string) =>
  videosList.find((v) => v.identifier === identifier)?.card;

export const VideoWrapper: FC<{ identifier: string }> = (props) => {
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
