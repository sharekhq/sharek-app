import { create } from 'zustand';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useShallow } from 'zustand/react/shallow';
import React, {
  createContext,
  FC,
  memo,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@gitroom/react/form/button';
import { useHotkeys } from 'react-hotkeys-hook';
import clsx from 'clsx';
import { EventEmitter } from 'events';

interface OpenModalInterface {
  title?: any;
  closeOnClickOutside?: boolean;
  removeLayout?: boolean;
  fullScreen?: boolean;
  top?: string | number;
  closeOnEscape?: boolean;
  withCloseButton?: boolean;
  askClose?: boolean;
  onClose?: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
  /**
   * Extra classes for the modal card itself. It replaces `classNames.modal`,
   * which this component declared but never read: the 26 call sites passing it
   * carried Mantine-era values (`bg-transparent`, `w-[100%] max-w-[1400px]`,
   * and a bare `md`) that would have changed those modals had it ever been
   * honoured, so they were deleted rather than migrated.
   */
  cardClassName?: string;
  size?: string | number;
  maxSize?: string | number;
  height?: string | number;
  id?: string;
}

interface ModalManagerStoreInterface {
  closeById(id: string): void;
  openModal(params: OpenModalInterface): void;
  closeAll(): void;
}

/**
 * A width the browser can actually use, or `undefined`.
 *
 * One call site passed Mantine's `xl`, a token from before the migration: the
 * browser drops it as an inline `width`, and being truthy it also suppressed
 * the minimum below — so that modal rendered with no width rule at all.
 * Normalising here sends an unusable value down the same branch as no value,
 * and keeps the clamp from wrapping it into a valid-looking `min(xl, 100%)`.
 */
const cssWidth = (size?: string | number) => {
  if (size === undefined || size === null || size === '') {
    return undefined;
  }
  const value = typeof size === 'number' ? `${size}px` : size;
  if (typeof CSS === 'undefined' || !CSS.supports('width', value)) {
    return undefined;
  }
  return value;
};

/**
 * What a call site asked for, capped at the width it was opened on. The clamp
 * has to be applied *to* the value: an inline width outranks every class, so
 * there is no outer rule that could hold it back.
 */
const clampToViewport = (value?: string) =>
  value ? `min(${value}, 100%)` : undefined;

interface State extends ModalManagerStoreInterface {
  modalManager: Array<{ id: string } & OpenModalInterface>;
}

const useModalStore = create<State>((set) => ({
  modalManager: [],
  openModal: (params) => {
    const newId = params.id || makeId(20);
    set((state) => ({
      modalManager: [
        ...state.modalManager,
        ...(!state.modalManager.some((p) => p.id === newId)
          ? [{ id: newId, ...params }]
          : []),
      ],
    }));
  },
  closeById: (id) =>
    set((state) => ({
      modalManager: state.modalManager.filter((modal) => modal.id !== id),
    })),
  closeAll: () => set({ modalManager: [] }),
}));

const CurrentModalContext = createContext<{
  id: string;
  headerSlot: HTMLElement | null;
  setHeaderSlot: (element: HTMLElement | null) => void;
}>({ id: '', headerSlot: null, setHeaderSlot: () => {} });

/**
 * Marks the spot in a modal title that the modal's body may render into — the
 * AI modals put their credits pill there, since the count is only known once
 * the body has loaded it. Placed by whoever writes the title, so the title
 * keeps deciding its own layout.
 */
export const ModalHeaderSlotTarget: FC<{ className?: string }> = ({
  className,
}) => {
  const { setHeaderSlot } = useContext(CurrentModalContext);
  return <div ref={setHeaderSlot} className={className} />;
};

/**
 * Renders its children into the title of the modal it sits in. Scoped to that
 * one modal: a modal opened on top of another fills its own header, which a
 * document-wide lookup for the slot could not do — it returns the first match,
 * and the modals render in the order they were opened.
 */
export const ModalHeaderSlot: FC<{ children: ReactNode }> = ({ children }) => {
  const { headerSlot } = useContext(CurrentModalContext);
  return headerSlot ? createPortal(children, headerSlot) : null;
};

interface ModalManagerInterface extends ModalManagerStoreInterface {
  closeCurrent(): void;
}

export const useModals = () => {
  const { closeAll, openModal, closeById } = useModalStore(
    useShallow((state) => ({
      openModal: state.openModal,
      closeById: state.closeById,
      closeAll: state.closeAll,
    }))
  );

  const modalContext = useContext(CurrentModalContext);

  return {
    openModal,
    closeAll,
    closeById,
    closeCurrent: () => {
      if (modalContext.id) {
        closeById(modalContext.id);
      }
    },
  } satisfies ModalManagerInterface;
};

export const Component: FC<{
  closeModal: (id: string) => void;
  zIndex: number;
  isLast: boolean;
  modal: { id: string } & OpenModalInterface;
}> = memo(({ isLast, modal, closeModal, zIndex }) => {
  const decision = useDecisionModal();
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const width = cssWidth(modal.size);
  const maxWidth = cssWidth(modal.maxSize);
  const closeModalFunction = useCallback(async () => {
    if (modal.askClose) {
      const open = await decision.open();
      if (!open) {
        return;
      }
    }
    modal?.onClose?.();
    closeModal(modal.id);
  }, [modal.id, closeModal]);

  const RenderComponent = useMemo(() => {
    return typeof modal.children === 'function'
      ? modal.children(closeModalFunction)
      : modal.children;
  }, [modal, closeModalFunction]);

  useHotkeys(
    'Escape',
    () => {
      if (isLast) {
        closeModalFunction();
      }
    },
    [isLast, closeModalFunction]
  );

  if (modal.removeLayout) {
    return (
      <div
        style={{ zIndex }}
        className={clsx(
          !modal.fullScreen
            ? 'pb-[50px] min-w-full min-h-full'
            : 'w-full h-full',
          'fixed flex left-0 top-0 bg-popup transition-all animate-fadeIn overflow-y-auto text-newTextColor',
          !isLast && '!overflow-hidden'
        )}
      >
        {/* min-w-0 on all three: each is a flex item, so each defaults to
            `min-width: auto` and is floored at its content's min-content width.
            The floor propagates outward — the card cannot shrink, so neither
            can its parents, so the overlay overflows the viewport it is fixed
            to. Fixing only the card leaves two floors above it. */}
        <div
          className={clsx(
            modal.fullScreen && 'flex',
            'relative flex-1 min-w-0'
          )}
        >
          <div
            className={clsx(
              modal.fullScreen
                ? 'flex flex-1 min-w-0'
                : 'absolute top-0 left-0 min-w-full min-h-full'
            )}
          >
            <div
              className={clsx(
                modal.fullScreen
                  ? 'w-full h-full flex-1 min-w-0'
                  : 'mx-auto py-[48px]'
              )}
              // Full screen, the card is `flex: 1 1 0%`, and flex-basis
              // supersedes `width` for the main size — an inline width is
              // written, looks correct, and never participates. It does
              // participate on the block path, so that is the only path that
              // writes it.
              {...(!modal.fullScreen &&
                width && { style: { width: clampToViewport(width) } })}
            >
              {typeof modal.children === 'function'
                ? modal.children(closeModalFunction)
                : modal.children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CurrentModalContext.Provider
      value={{ id: modal.id, headerSlot, setHeaderSlot }}
    >
      <div
        onClick={closeModalFunction}
        style={{ zIndex }}
        className={clsx(
          'fixed flex left-0 top-0 min-w-full min-h-full bg-popup transition-all animate-fadeIn overflow-y-auto text-newTextColor',
          !modal.fullScreen && 'pb-[50px]'
        )}
      >
        <div className="relative flex-1">
          <div
            style={
              modal.top
                ? { paddingTop: modal.top, paddingBottom: modal.top }
                : {}
            }
            className={clsx(
              // max-w-full pins this to the viewport so the card's own `100%`
              // has something fixed to resolve against: left to shrink-to-fit,
              // it grows with whatever the card holds, and a clamp against a
              // box that is already too wide clamps to nothing.
              'absolute min-w-full max-w-full',
              !modal.fullScreen
                ? modal.top
                  ? ''
                  : 'min-h-full pt-[100px] pb-[100px]'
                : 'h-screen',
              modal.size && modal.height
                ? 'flex justify-center items-center'
                : 'top-0 left-0'
            )}
          >
            <div
              className={clsx(
                !modal.removeLayout && 'gap-[24px] p-[32px]',
                'bg-newBgColorInner mx-auto flex flex-col w-fit max-w-full rounded-[24px] relative shadow-card',
                // 600px is the measure this modal reads best at, not a floor it
                // must keep: a minimum is the last clamp CSS applies, so a plain
                // `min-w-[600px]` cannot yield to a 390px phone and 52 call
                // sites overflowed it by 210px. Yielding happens in the value.
                width ? '' : 'min-w-[min(600px,100%)]',
                modal.fullScreen && 'h-full',
                modal.cardClassName
              )}
              {...((!!width || !!modal.height || !!maxWidth) && {
                style: {
                  ...(width ? { width: clampToViewport(width) } : {}),
                  ...(modal.height ? { height: modal.height } : {}),
                  ...(maxWidth ? { maxWidth: clampToViewport(maxWidth) } : {}),
                },
              })}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center">
                <div className="text-[24px] font-[600] flex-1">
                  {modal.title}
                </div>
                {typeof modal.withCloseButton === 'undefined' ||
                modal.withCloseButton ? (
                  <div className="cursor-pointer">
                    <button
                      className={clsx(
                        'outline-none absolute end-[20px] top-[20px] mantine-UnstyledButton-root mantine-ActionIcon-root hover:bg-tableBorder cursor-pointer mantine-Modal-close mantine-1dcetaa',
                        // The ring is not decoration: global.scss drops every
                        // outline, so this is the only thing a keyboard user
                        // sees on the control that closes the dialog.
                        'focus-visible:ring-2 focus-visible:ring-brand',
                        // A finger gets 44px around the same 16px glyph — the
                        // inset shrinks by exactly what the box grew, so the
                        // cross stays where a mouse user last saw it.
                        'coarse:min-w-[44px] coarse:min-h-[44px] coarse:end-[6px] coarse:top-[6px]',
                        'coarse:flex coarse:items-center coarse:justify-center'
                      )}
                      type="button"
                      onClick={closeModalFunction}
                    >
                      <svg
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                          fill="currentColor"
                          fillRule="evenodd"
                          clipRule="evenodd"
                        ></path>
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
              <div
                className={clsx(
                  'whitespace-pre-line',
                  !!modal.height && !!modal.size && 'flex flex-1 flex-col'
                )}
              >
                {RenderComponent}
              </div>
            </div>
          </div>
        </div>
      </div>
    </CurrentModalContext.Provider>
  );
});

export const ModalManagerInner: FC = () => {
  const { closeModal, modalManager } = useModalStore(
    useShallow((state) => ({
      closeModal: state.closeById,
      modalManager: state.modalManager,
    }))
  );

  useEffect(() => {
    if (modalManager.length > 0) {
      document.querySelector('body')?.classList.add('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.add('blur-xs', 'pointer-events-none')
      );
    } else {
      document.querySelector('body')?.classList.remove('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.remove('blur-xs', 'pointer-events-none')
      );
    }
  }, [modalManager]);

  if (modalManager.length === 0) {
    return null;
  }

  return (
    <>
      <style>{`body, html { overflow: hidden !important; }`}</style>
      {modalManager.map((modal, index) => (
        <Component
          isLast={modalManager.length - 1 === index}
          key={modal.id}
          modal={modal}
          zIndex={200 + index}
          closeModal={closeModal}
        />
      ))}
    </>
  );
};
export const ModalManager: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div>
      <ModalManagerEmitter />
      <ModalManagerInner />
      <div className="transition-all w-full">{children}</div>
    </div>
  );
};

const emitter = new EventEmitter();
// Opens a modal from outside React — the global 402 handler is a plain
// callback, not a component. The listener below hands this straight to
// `openModal`, which is what the parameter has to be.
export const showModalEmitter = (params: OpenModalInterface) => {
  emitter.emit('show', params);
};

export const ModalManagerEmitter: FC = () => {
  const { showModal } = useModalStore(
    useShallow((state) => ({
      showModal: state.openModal,
    }))
  );

  useEffect(() => {
    emitter.on('show', (params: OpenModalInterface) => {
      showModal(params);
    });

    return () => {
      emitter.removeAllListeners('show');
    };
  }, []);
  return null;
};

export const DecisionModal: FC<{
  description: string;
  approveLabel: string;
  cancelLabel: string;
  onlyApprove: boolean;
  resolution: (value: boolean) => void;
}> = ({ description, cancelLabel, approveLabel, resolution, onlyApprove }) => {
  const { closeCurrent } = useModals();
  return (
    <div className="flex flex-col">
      <div className="max-w-[600px]">{description}</div>
      <div className="flex gap-[12px] mt-[16px]">
        <Button
          variant="danger"
          onClick={() => {
            resolution(true);
            closeCurrent();
          }}
        >
          {approveLabel}
        </Button>
        {!onlyApprove && (
          <Button
            variant="ghost"
            onClick={() => {
              resolution(false);
              closeCurrent();
            }}
          >
            {cancelLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

export const decisionModalEmitter = new EventEmitter();

export const areYouSure = ({
  title = 'Are you sure?',
  description = 'Are you sure you want to close this modal?' as any,
  approveLabel = 'Yes',
  cancelLabel = 'No',
} = {}): Promise<boolean> => {
  return new Promise<boolean>((newRes) => {
    decisionModalEmitter.emit('open', {
      title,
      description,
      approveLabel,
      cancelLabel,
      newRes,
    });
  });
};

export const DecisionEverywhere: FC = () => {
  const decision = useDecisionModal();
  useEffect(() => {
    decisionModalEmitter.on('open', decision.open);
  }, []);
  return null;
};

export const useDecisionModal = () => {
  const modals = useModals();
  const open = useCallback(
    ({
      title = 'Are you sure?',
      description = 'Are you sure you want to close this modal?' as any,
      onlyApprove = false,
      approveLabel = 'Yes',
      cancelLabel = 'No',
      newRes = undefined as any,
    } = {}) => {
      return new Promise<boolean>((res) => {
        modals.openModal({
          title,
          askClose: false,
          onClose: () => res(false),
          children: (
            <DecisionModal
              onlyApprove={onlyApprove}
              resolution={(value) => (newRes ? newRes(value) : res(value))}
              description={description}
              approveLabel={approveLabel}
              cancelLabel={cancelLabel}
            />
          ),
        });
      });
    },
    [modals]
  );

  return { open };
};
