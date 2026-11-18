import { useChatContext } from '@copilotkit/react-ui';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * CopilotKit's own button hard-codes "Open Chat" / "Close Chat" as its accessible
 * name and takes no label for it, so `CopilotPopup` gets this copy of it instead:
 * the same markup, classes and icons, named from the locale.
 */
export const AssistantButton = () => {
  const t = useT();
  const { open, setOpen, icons } = useChatContext();
  return (
    <div onClick={() => setOpen(!open)}>
      <button
        className={`copilotKitButton ${open ? 'open' : ''}`}
        aria-label={
          open
            ? t('assistant_close_chat', 'Close the Assistant chat')
            : t('assistant_open_chat', 'Open the Assistant chat')
        }
      >
        <div className="copilotKitButtonIcon copilotKitButtonIconOpen">
          {icons.openIcon}
        </div>
        <div className="copilotKitButtonIcon copilotKitButtonIconClose">
          {icons.closeIcon}
        </div>
      </button>
    </div>
  );
};
