import { useDropzone } from 'react-dropzone';
import { FC, ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
export const DropFiles: FC<{
  children: ReactNode;
  className?: string;
  onDrop: (files: File[]) => void;
  disabled?: boolean;
  /** Replaces the black overlay shown during a drag. */
  overlay?: ReactNode;
  /** No tab stop on the zone: over a large area it's invisible, as a global rule removes outlines. */
  noKeyboard?: boolean;
  /**
   * Hears a drop and a leave on their way down rather than as they bubble, for a zone
   * whose children stop them. CopilotKit's chat body does, even with attachments off.
   */
  capture?: boolean;
}> = (props) => {
  const t = useT();
  const toaster = useToaster();

  const { getRootProps, isDragActive } = useDropzone({
    noKeyboard: props.noKeyboard,
    onDrop: (files) => {
      if (props.disabled) {
        toaster.show(
          t(
            'upload_current_in_progress_please_wait_and_then_try_again',
            'Upload current in progress, please wait and then try again.'
          ),
          'warning'
        );
        return ;
      }
      props.onDrop(files);
    },
  });
  const { onDrop, onDragLeave, ...root } = getRootProps();
  return (
    <div
      {...root}
      {...(props.capture
        ? { onDropCapture: onDrop, onDragLeaveCapture: onDragLeave }
        : { onDrop, onDragLeave })}
      className={clsx("relative", props.className)}
    >
      {isDragActive &&
        (props.overlay ?? (
          <div className="absolute start-0 top-0 w-full h-full bg-black/90 flex items-center justify-center z-[200] animate-normalFadeIn">
            {t('drag_n_drop_some_files_here', 'Drag n drop some files here')}
          </div>
        ))}
      {props.children}
    </div>
  );
};
