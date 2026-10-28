'use client';

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deriveTranslationKey } from '@gitroom/react/translation/derive-key';
import { assistantLabels } from '@gitroom/frontend/components/ui/assistant.labels';
import { PicksSocialsComponent } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { EditorWrapper } from '@gitroom/frontend/components/new-launch/editor';
import { SelectCurrent } from '@gitroom/frontend/components/new-launch/select.current';
import {
  Providers,
  ShowAllProviders,
} from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { getProviderSettingsMeta } from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import {
  DatePicker,
  DatePickerPanel,
} from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';
import { TagsComponent } from '@gitroom/frontend/components/launches/tags.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { CopilotPopup } from '@copilotkit/react-ui';
import { DummyCodeComponent } from '@gitroom/frontend/components/new-launch/dummy.code.component';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import {
  SettingsIcon,
  ChevronDownIcon,
  CloseIcon,
  TrashIcon,
  DropdownArrowSmallIcon,
  EyeIcon,
  PlusIcon,
  SettingsOutlineIcon,
  TagIcon,
  RepeatIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  BottomSheet,
  BottomSheetButton,
  BottomSheetHeader,
  BottomSheetRow,
  useDialogFocus,
} from '@gitroom/frontend/components/ui/bottom.sheet.component';
import {
  MOBILE_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';
import {
  MobileTopBar,
  MobileTopBarAction,
} from '@gitroom/frontend/components/new-launch/mobile.top.bar';
import { useHasScroll } from '@gitroom/frontend/components/ui/is.scroll.hook';
import { useShortlinkPreference } from '@gitroom/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button } from '@gitroom/react/form/button';

// A channel name inside a translated sentence. Isolated (FSI…PDI, the
// plain-text <bdi>) so a Latin name in an Arabic sentence, or the reverse,
// keeps its own direction and its trailing punctuation stays with it. The
// calls pass `escapeValue: false`: React escapes the text it renders, and
// i18next escaping it first would show a name's & or ' as an entity.
const isolate = (text = '') => `\u2068${text}\u2069`;

// The two answers under a question sit side by side, and stack on a phone,
// where each takes the full width and grows to fit a long channel name.
const answerRowClasses = 'flex w-full gap-[10px] phone:flex-col';
const answerButtonClasses =
  'flex-1 phone:!h-auto phone:min-h-[44px] phone:py-[8px]';

export const ManageModal: FC<AddEditModalProps> = (props) => {
  const t = useT();
  const fetch = useFetch();
  const ref = useRef(null);
  const existingData = useExistingData();
  const [loading, setLoading] = useState(false);
  const toaster = useToaster();
  const modal = useModals();
  const [showSettings, setShowSettings] = useState(false);
  // at 1025px and below the preview takes the editor's place
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  // the sheets that hold the rest of the composer at 1025px and below
  const [mobileSheet, setMobileSheet] = useState<
    'channels' | 'settings' | 'tags' | 'repeat' | 'date' | null
  >(null);
  // the date sheet's choice, applied to the post on Save only
  const [dateDraft, setDateDraft] = useState<dayjs.Dayjs>(dayjs());
  const { data: shortlinkPreferenceData } = useShortlinkPreference();

  const { addEditSets, mutate, customClose, dummy } = props;

  const {
    selectedIntegrations,
    hide,
    date,
    setDate,
    repeater,
    setRepeater,
    tags,
    setTags,
    integrations,
    setSelectedIntegrations,
    locked,
    current,
    activateExitButton,
    setHide,
    channelDates,
    setChannelDate,
    publishBlockers,
  } = useLaunchStore(
    useShallow((state) => ({
      hide: state.hide,
      setHide: state.setHide,
      date: state.date,
      setDate: state.setDate,
      channelDates: state.channelDates,
      setChannelDate: state.setChannelDate,
      current: state.current,
      repeater: state.repeater,
      setRepeater: state.setRepeater,
      tags: state.tags,
      setTags: state.setTags,
      selectedIntegrations: state.selectedIntegrations,
      integrations: state.integrations,
      setSelectedIntegrations: state.setSelectedIntegrations,
      locked: state.locked,
      activateExitButton: state.activateExitButton,
      publishBlockers: state.publishBlockers,
    }))
  );
  // the other channels of an existing post show and move only their own date
  const channelDate = channelDates[current];
  const pickerDate = channelDate || date;
  const setPickerDate = useCallback(
    (newDate: dayjs.Dayjs) => {
      if (channelDate) {
        return setChannelDate(current, newDate);
      }

      setDate(newDate);
    },
    [channelDate, current, setChannelDate, setDate]
  );

  // At 1025px and below the channel settings pane opens as a sheet over the
  // editor: it takes the focus and closes on its own Escape. It stays the one
  // element the providers portal their settings into, so it is not a
  // BottomSheet, and from 1026px up it is the inline panel it always was.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // The sheets belong to 1025px and below: growing past it (an iPad turned to
  // landscape) closes the one open, so no sheet sits over the wide composer and
  // the footer's tags control comes back. Set during render, as the app shell's
  // drawer is, so no commit shows a sheet over the wide layout.
  if (mobileSheet && !isMobile) setMobileSheet(null);
  const settingsSheet = showSettings && isMobile;
  const { container: settingsPane, keepTabInside: keepPaneTabInside } =
    useDialogFocus<HTMLDivElement>(settingsSheet);
  const paneTitleId = useId();

  // the channels the post already has, each with its own post
  const existingPosts = [existingData, ...(existingData.siblings || [])];
  // the channel in view, or the one that was opened
  const channel =
    existingPosts.find((p) => p.integration === current) || existingData;

  // A channel's settings panel can veto publishing before submission, for
  // platforms whose guidelines require the publish control itself to be
  // disabled with the reason on hover rather than a warning on submit. Each
  // reason arrives already translated and already naming its channel, so one
  // blocked channel in a mixed post never reads as an unexplained global
  // freeze, and several blocked channels each state their own cause.
  const blockedReasons = useMemo(
    () => Object.values(publishBlockers).filter(Boolean),
    [publishBlockers]
  );
  const publishBlocked = blockedReasons.length > 0;

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  // t is a dependency because the labels are translated: a language switch
  // re-creates it, and never changes the pick this is otherwise keyed on.
  const currentIntegrationText = useMemo(() => {
    if (current === 'global') {
      return (
        <div className="flex items-center gap-[10px]">
          <div className="relative">
            <SettingsIcon size={15} className="text-current" />
          </div>
          <div>{t('settings', 'Settings')}</div>
        </div>
      );
    }

    const currentIntegration = integrations.find((p) => p.id === current)!;

    return (
      <div className="flex items-center gap-[10px]">
        <img
          src={`/icons/platforms/${currentIntegration.identifier}.png`}
          className="w-[20px] h-[20px] rounded-[4px]"
          alt={currentIntegration.identifier}
        />
        <div>
          {currentIntegration.name} {t('channel_settings', 'Settings')}
        </div>
      </div>
    );
  }, [current, t]);

  const changeCustomer = useCallback(
    (customer: string) => {
      const neededIntegrations = integrations.filter(
        (p) => p?.customer?.id === customer
      );
      setSelectedIntegrations(
        neededIntegrations.map((p) => ({
          settings: {},
          selectedIntegrations: p,
        }))
      );
    },
    [integrations]
  );

  const askClose = useCallback(async () => {
    if (!activateExitButton || dummy) {
      return;
    }

    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!')
      )
    ) {
      if (customClose) {
        customClose();
        return;
      }
      modal.closeAll();
    }
  }, [activateExitButton, dummy]);

  const deletePost = useCallback(async () => {
    setLoading(true);
    if (existingData.siblings?.length) {
      const groups = await new Promise<string[]>((resolve) => {
        modal.openModal({
          id: 'delete-post-channels',
          title: t('delete_post', 'Delete Post'),
          onClose: () => resolve([]),
          children: (
            <div className="flex flex-col">
              <div className="text-[20px] mb-[20px]">
                {t(
                  'delete_post_from_all_channels_question',
                  'This post was created for more than one channel. Do you want to delete it from all of them?'
                )}
              </div>
              <div className={answerRowClasses}>
                <div className="flex-1 flex">
                  <Button
                    type="button"
                    variant="danger"
                    className={answerButtonClasses}
                    onClick={() => {
                      modal.closeById('delete-post-channels');
                      resolve(existingPosts.map((p) => p.group!));
                    }}
                  >
                    {t('delete_from_all_channels', 'Delete from all channels')}
                  </Button>
                </div>
                <div className="flex-1 flex">
                  <Button
                    type="button"
                    variant="ghost"
                    className={answerButtonClasses}
                    onClick={() => {
                      modal.closeById('delete-post-channels');
                      resolve([channel.group!]);
                    }}
                  >
                    {t('delete_only_from_named', 'Only from {{name}}', {
                      name: isolate(
                        integrations.find((p) => p.id === channel.integration)
                          ?.name
                      ),
                      interpolation: { escapeValue: false },
                    })}
                  </Button>
                </div>
              </div>
            </div>
          ),
        });
      });

      if (!groups.length) {
        setLoading(false);
        return;
      }

      await Promise.all(
        groups.map((group) =>
          fetch(`/posts/${group}`, {
            method: 'DELETE',
          })
        )
      );
      mutate();
      modal.closeAll();
      return;
    }

    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_post',
          'Are you sure you want to delete this post?'
        ),
        t('yes_delete_it', 'Yes, delete it!')
      ))
    ) {
      setLoading(false);
      return;
    }
    await fetch(`/posts/${existingData.group}`, {
      method: 'DELETE',
    });
    mutate();
    modal.closeAll();
    return;
  }, [existingData, mutate, modal, current, integrations]);

  const schedule = useCallback(
    (type: 'draft' | 'now' | 'schedule' | 'update') => async () => {
      let republish = false;
      // the channels saved as another type, the rest are saved as `type`
      const saveAs: Record<string, 'draft' | 'schedule' | 'update'> = {};
      const saveTypeOf = (id: string) => saveAs[id] || type;
      // the channels that already went out, or are going out right now
      const published = existingPosts.filter(
        (p) =>
          p.posts?.[0]?.state === 'PUBLISHED' ||
          (p.posts?.[0]?.state === 'QUEUE' &&
            dayjs().isAfter((channelDates[p.integration] || date).utc()))
      );
      const others = existingPosts.filter((p) => p !== channel);

      // another channel whose date already passed would go out right away, it
      // only gets its details saved
      if (type === 'schedule') {
        for (const p of others) {
          if (
            !published.includes(p) &&
            dayjs().isAfter((channelDates[p.integration] || date).utc())
          ) {
            saveAs[p.integration] = 'update';
          }
        }
      }

      // a draft of a post with other channels leaves the published ones as they are
      if (type === 'draft' && existingData.siblings?.length) {
        for (const p of published) {
          if (p.posts[0].state === 'PUBLISHED') {
            saveAs[p.integration] = 'update';
          }
        }
      }

      // the save that leaves a channel in its state
      const asItIs = (p: (typeof existingPosts)[number]) =>
        p.posts?.[0]?.state === 'DRAFT'
          ? 'draft'
          : p.posts?.[0]?.state === 'QUEUE' && !published.includes(p)
          ? 'schedule'
          : 'update';

      // like the delete, a save that changes the state of the other channels
      // (scheduling their drafts, moving them to drafts) can do it only for
      // the channel in view, the others keep their state
      if (
        type !== 'update' &&
        others.some(
          (p) =>
            !saveAs[p.integration] &&
            // the republish question covers the published ones
            (type === 'draft' || !published.includes(p)) &&
            asItIs(p) !== type
        )
      ) {
        const question =
          type === 'draft'
            ? t(
                'draft_post_in_all_channels_question',
                'This post was created for more than one channel. Do you want to move all of them to drafts?'
              )
            : type === 'now'
            ? t(
                'post_now_in_all_channels_question',
                'This post was created for more than one channel. Do you want to post all of them now?'
              )
            : t(
                'schedule_post_in_all_channels_question',
                'This post was created for more than one channel. Do you want to schedule all of them?'
              );

        const allChannels =
          type === 'draft'
            ? t('draft_all_channels', 'Move all channels to drafts')
            : type === 'now'
            ? t('post_now_all_channels', 'Post all channels now')
            : t('schedule_all_channels', 'Schedule all channels');

        const whichChannels = await new Promise((resolve) => {
          modal.openModal({
            id: 'change-post-channels',
            title: t('what_do_you_want_to_do', 'What do you want to do?'),
            onClose: () => resolve(undefined),
            children: (
              <div className="flex flex-col">
                <div className="text-[20px] mb-[20px]">{question}</div>
                <div className={answerRowClasses}>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className={answerButtonClasses}
                      onClick={() => {
                        modal.closeById('change-post-channels');
                        resolve('all');
                      }}
                    >
                      {allChannels}
                    </Button>
                  </div>
                  {/* a published channel in view stays published on a draft */}
                  {!saveAs[channel.integration] && (
                    <div className="flex-1 flex">
                      <Button
                        type="button"
                        variant="ghost"
                        className={answerButtonClasses}
                        onClick={() => {
                          modal.closeById('change-post-channels');
                          resolve('only');
                        }}
                      >
                        {t('only_channel_named', 'Only {{name}}', {
                          name: isolate(
                            integrations.find(
                              (p) => p.id === channel.integration
                            )?.name
                          ),
                          interpolation: { escapeValue: false },
                        })}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ),
          });
        });

        if (!whichChannels) {
          return;
        }

        if (whichChannels === 'only') {
          for (const p of others) {
            saveAs[p.integration] = asItIs(p);
          }
        }
      }

      // the published channels that would go out again
      const republishing = published.filter((p) => !saveAs[p.integration]);

      if ((type === 'now' || type === 'schedule') && republishing.length) {
        const channels = republishing
          .map(
            (p) =>
              `${isolate(
                integrations.find((i) => i.id === p.integration)?.name
              )} ${t('republish_at', 'at')} ${(
                channelDates[p.integration] || date
              ).format('DD/MM/YYYY HH:mm')}`
          )
          .join(', ');
        const isRecurring =
          !!repeater || !!existingData?.posts?.[0]?.intervalInDays;

        // it closes on a choice, so a save that then fails its checks shows
        // the channel to fix
        const whatToDo = await new Promise((resolve) => {
          modal.openModal({
            id: 'republish-post',
            title: t('what_do_you_want_to_do', 'What do you want to do?'),
            onClose: () => resolve(undefined),
            children: (
              <div className="flex flex-col">
                <div className="text-[20px] mb-[20px]">
                  {t(
                    'post_already_published_republish_warning',
                    'This post was already published. Republishing will publish it again to'
                  )}{' '}
                  {channels}.
                  {isRecurring && (
                    <div className="mt-[10px]">
                      {t(
                        'republish_recurring_note',
                        'This is a recurring post: your changes apply to all future recurrences starting now.'
                      )}
                    </div>
                  )}
                </div>
                <div className={answerRowClasses}>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className={answerButtonClasses}
                      onClick={() => {
                        modal.closeById('republish-post');
                        resolve('update');
                      }}
                    >
                      {t(
                        'just_update_post_details',
                        'Just update the post details'
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className={answerButtonClasses}
                      onClick={() => {
                        modal.closeById('republish-post');
                        resolve('republish');
                      }}
                    >
                      {t('republish_the_post', 'Republish the post')}
                    </Button>
                  </div>
                </div>
              </div>
            ),
          });
        });

        if (!whatToDo) {
          return;
        }

        if (whatToDo === 'update') {
          for (const p of republishing) {
            saveAs[p.integration] = 'update';
          }
        }

        if (whatToDo === 'republish') {
          republish = true;
        }
      }

      setLoading(true);

      // Pull the local values to build the payload, but rely on the server
      // (`/posts/valid`) for the actual validation — checkValidity now lives
      // server-side so it can't be bypassed.
      const allValues = await ref.current.getAllValues();

      const integrationById = (id: string) =>
        selectedIntegrations.find((p) => p.integration.id === id);

      const group = existingData.group || makeId(10);

      const posts = allValues.map((post: any) => ({
        integration: {
          id: post.id,
        },
        // every channel of an existing post updates its own post
        group:
          existingPosts.find((p) => p.integration === post.id)?.group || group,
        ...(channelDates[post.id]
          ? {
              date: channelDates[post.id].utc().format('YYYY-MM-DDTHH:mm:ss'),
            }
          : {}),
        settings: { ...(post.settings || {}) },
        value: post.values.map((value: any) => ({
          ...(value.id ? { id: value.id } : {}),
          content: value.content,
          delay: value.delay || 0,
          image:
            (value?.media || []).map(
              ({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
                id,
                path,
                alt,
                thumbnail,
                thumbnailTimestamp,
              })
            ) || [],
        })),
      }));

      if (!dummy) {
        const validResponse = await fetch('/posts/valid', {
          method: 'POST',
          body: JSON.stringify({ type, posts }),
        });

        if (!validResponse.ok) {
          if (validResponse.status !== 402) {
            const { message } = await validResponse.json().catch(() => ({}));
            toaster.show(
              typeof message === 'string'
                ? message
                : t('post_save_failed', 'Could not save the post'),
              'warning'
            );
          }
          setLoading(false);
          return;
        }

        const checkAllValid = await validResponse.json();

        const focus = (id: string, where: 'fix' | 'preview') => {
          integrationById(id)?.ref?.current?.[where]?.();
        };

        const notEnoughChars = checkAllValid.filter((p: any) => p.emptyContent);

        for (const item of notEnoughChars) {
          toaster.show(
            `${platformLabel(item.identifier)} (${item.name}):` +
              ' ' +
              t(
                'post_needs_content_or_image',
                'Your post should have at least one character or one image.'
              ),
            'warning'
          );
          setLoading(false);
          focus(item.id, 'preview');
          return;
        }

        // a channel saved as a draft gets these checks once it's scheduled
        const notDrafts = checkAllValid.filter(
          (p: any) => saveTypeOf(p.id) !== 'draft'
        );

        for (const item of notDrafts) {
          if (item.valid === false) {
            toaster.show(
              `${platformLabel(item.identifier)} (${item.name}): ${
                (item.settingsError &&
                  t(
                    deriveTranslationKey('validation', item.settingsError),
                    item.settingsError
                  )) ||
                t('please_fix_your_settings', 'Please fix your settings')
              }`,
              'warning'
            );
            focus(item.id, 'fix');
            setLoading(false);
            setShowSettings(true);
            return;
          }

          if (item.errors !== true) {
            toaster.show(
              `${platformLabel(item.identifier)} (${item.name}): ${t(
                deriveTranslationKey('validation', item.errors),
                item.errors
              )}`,
              'warning'
            );
            focus(item.id, 'preview');
            setLoading(false);
            setShowSettings(false);
            setMobileTab('edit');
            return;
          }

          if (item.tooLong) {
            toaster.show(
              `${item.name} (${item.identifier}) ${t(
                'post_is_too_long',
                'post is too long, please fix it'
              )}`,
              'warning'
            );
            focus(item.id, 'preview');
            setLoading(false);
            return;
          }
        }
      }

      const shortlinkPreference = shortlinkPreferenceData?.shortlink || 'ASK';

      let shortLink = false;

      if (!dummy && shortlinkPreference !== 'NO') {
        const shortLinkUrl = await (
          await fetch('/posts/should-shortlink', {
            method: 'POST',
            body: JSON.stringify({
              messages: allValues
                // platforms that remove links won't keep shortlinks either
                .filter(
                  (p: any) => !integrationById(p.id)?.integration?.stripLinks
                )
                .flatMap((p: any) => p.values.flatMap((a: any) => a.content)),
            }),
          })
        ).json();

        if (shortLinkUrl.ask) {
          if (shortlinkPreference === 'YES') {
            // Automatically shortlink without asking
            shortLink = true;
          } else {
            // ASK: Show the dialog
            shortLink = await deleteDialog(
              t(
                'shortlink_urls_question',
                'Do you want to shortlink the URLs? it will let you get statistics over clicks'
              ),
              t('yes_shortlink_it', 'Yes, shortlink it!'),
              undefined,
              t('no_original_urls', 'No, original URLs')
            );
          }
        }
      }

      const data = {
        type,
        ...(republish ? { republish } : {}),
        ...(repeater ? { inter: repeater } : {}),
        tags,
        shortLink,
        date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
        posts,
      };

      if (dummy) {
        modal.openModal({
          title: '',
          children: <DummyCodeComponent code={data} />,
          size: '100%',
          withCloseButton: false,
          closeOnEscape: true,
          closeOnClickOutside: true,
        });

        setLoading(false);
      }

      if (!dummy) {
        if (addEditSets) {
          addEditSets(data);
        } else {
          // every type of save is its own request, the drafts last, since a
          // draft save skips the checks the others still run
          let saved = false;
          for (const requestType of ['update', 'schedule', 'now', 'draft']) {
            const request = {
              type: requestType,
              posts: posts.filter(
                (p: any) => saveTypeOf(p.integration.id) === requestType
              ),
            };
            if (!request.posts.length) {
              continue;
            }

            const response = await fetch('/posts', {
              method: 'POST',
              body: JSON.stringify({ ...data, ...request }),
            });

            if (!response.ok) {
              if (response.status !== 402) {
                const { message } = await response.json().catch(() => ({}));
                toaster.show(
                  typeof message === 'string'
                    ? message
                    : t('post_save_failed', 'Could not save the post'),
                  'warning'
                );
              }
              // the channels saved before the failure show in the calendar
              if (saved) {
                mutate();
              }
              setLoading(false);
              return;
            }
            saved = true;
          }
        }

        if (!addEditSets) {
          mutate();
          toaster.show(
            !existingData.integration
              ? t('added_successfully', 'Added successfully')
              : t('updated_successfully', 'Updated successfully')
          );
        }
        if (customClose) {
          setTimeout(() => {
            customClose();
          }, 2000);
        }

        if (!addEditSets) {
          modal.closeAll();
        }
      }
    },
    [
      ref,
      repeater,
      tags,
      date,
      channelDates,
      current,
      integrations,
      selectedIntegrations,
      addEditSets,
      dummy,
      shortlinkPreferenceData,
    ]
  );

  const scheduleLabel = dummy
    ? t('create_output', 'Create output')
    : !existingData?.integration
    ? t('add_to_calendar', 'Add to calendar')
    : existingData?.posts?.[0]?.state === 'DRAFT'
    ? t('schedule', 'Schedule')
    : t('update', 'Update');

  // the Post menu at 1025px and below: the desktop buttons, in their order
  const mobileActions: MobileTopBarAction[] = addEditSets
    ? [
        {
          label: t('save_set', 'Save Set'),
          variant: 'primary',
          onClick: schedule('draft'),
        },
      ]
    : [
        {
          label: scheduleLabel,
          variant: 'primary',
          onClick: schedule('schedule'),
          disabled: publishBlocked,
        },
        ...(!dummy
          ? [
              {
                label: t('post_now', 'Post Now'),
                variant: 'secondary' as const,
                onClick: schedule('now'),
                disabled: publishBlocked,
              },
            ]
          : []),
        {
          label: t('save_as_draft', 'Save as Draft'),
          variant: 'tertiary',
          onClick: schedule('draft'),
        },
      ];

  // the Settings sheet offers the channel settings only when there are any
  const hasChannelSettings = useMemo(() => {
    const identifiers =
      current === 'global'
        ? selectedIntegrations.map((p) => p.integration.identifier)
        : [integrations.find((p) => p.id === current)?.identifier];

    return identifiers.some(
      (identifier) =>
        !!getProviderSettingsMeta(
          Providers.find((p) => p.identifier === identifier)?.component
        )?.SettingsComponent
    );
  }, [current, selectedIntegrations, integrations]);

  // at 1025px and below the settings, tags, repeat and delete live in a sheet
  const settingsButton = !dummy && (
    <button
      type="button"
      onClick={() => setMobileSheet('settings')}
      aria-label={t('settings', 'Settings')}
      className="hidden mobile:flex shrink-0 w-[44px] h-[44px] justify-center items-center rounded-[8px] text-muted focus-visible:ring-2 focus-visible:ring-brand"
    >
      <SettingsOutlineIcon />
    </button>
  );

  // at 1025px and below there is no room for the preview column, it replaces
  // the editor instead
  const previewButton = (
    <button
      type="button"
      onClick={() => setMobileTab(mobileTab === 'preview' ? 'edit' : 'preview')}
      aria-pressed={mobileTab === 'preview'}
      aria-label={t('preview', 'Preview')}
      className={clsx(
        'hidden mobile:flex shrink-0 w-[44px] h-[44px] justify-center items-center rounded-[8px] focus-visible:ring-2 focus-visible:ring-brand',
        mobileTab === 'preview'
          ? 'bg-selectedBg text-selectedText'
          : 'text-muted'
      )}
    >
      <EyeIcon />
    </button>
  );

  return (
    <div className="w-full h-full flex-1 p-[40px] mobile:p-0 mobile:h-auto mobile:min-h-full flex relative">
      <div className="flex flex-1 bg-newBgColorInner rounded-[20px] mobile:rounded-none flex-col">
        <MobileTopBar
          onBack={askClose}
          actions={mobileActions}
          disabled={selectedIntegrations.length === 0 || loading || locked}
          loading={loading}
          reasons={blockedReasons}
        >
          <DatePicker
            onChange={setPickerDate}
            date={pickerDate}
            onOpen={() => {
              setDateDraft(pickerDate);
              setMobileSheet('date');
            }}
          />
        </MobileTopBar>
        <div className="flex-1 flex min-h-0 mobile:contents">
          <div
            className={clsx(
              'flex flex-col flex-1 border-e border-newBorder',
              // A single pane has no divider to draw, and nothing to its start
              // edge to be floored against.
              'mobile:border-e-0 mobile:min-w-0',
              mobileTab === 'preview' && 'mobile:flex-none'
            )}
          >
            {/* The top bar carries the post at 1025px and below, so this
                65px header would be a second one. */}
            <div className="mobile:hidden bg-newBgColor h-[65px] rounded-s-[20px] !rounded-b-[0] flex items-center gap-[12px] px-[20px] text-[20px] font-[600]">
              {t('create_post_title', 'Create Post')}
              <CreationMethodBadge
                creationMethod={existingData?.posts?.[0]?.creationMethod}
                size="sm"
              />
            </div>
            <div className="flex-1 flex flex-col gap-[16px] mobile:gap-0 bg-panel mobile:bg-transparent">
              <div
                className={clsx(
                  // at 1025px and below the page scrolls, not this box
                  'flex-1 relative mobile:flex mobile:flex-col',
                  // `current === 'global'` hides the settings pane below, so
                  // without this half of the condition the editor could be
                  // hidden for a pane that is not showing — a blank column.
                  showSettings && current !== 'global' && 'hidden'
                )}
              >
                <div
                  id="social-content"
                  className="gap-[32px] mobile:gap-[16px] flex flex-col pe-[8px] pt-[20px] ps-[20px] mobile:px-[16px] mobile:pt-[12px] mobile:static mobile:flex-1 absolute top-0 left-0 w-full h-full mobile:h-auto overflow-x-hidden overflow-y-auto mobile:overflow-y-visible scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner"
                >
                  {/* at 1025px and below a new post picks its channels in
                      the + sheet */}
                  <div
                    className={clsx(
                      'flex w-full',
                      !existingData.integration && 'mobile:hidden'
                    )}
                  >
                    <div className="flex flex-1">
                      <PicksSocialsComponent toolTip={true} />
                    </div>
                    <div className="mobile:hidden">
                      {/* an existing post keeps its channels */}
                      {!dummy && !existingData.integration && (
                        <SelectCustomer
                          onChange={changeCustomer}
                          integrations={integrations}
                        />
                      )}
                    </div>
                    {!!existingData.integration && (
                      <>
                        <div className="hidden mobile:flex items-center">
                          <CreationMethodBadge
                            creationMethod={
                              existingData?.posts?.[0]?.creationMethod
                            }
                            size="sm"
                          />
                        </div>
                        {previewButton}
                        {settingsButton}
                      </>
                    )}
                  </div>
                  <div className="flex flex-1 gap-[6px] mobile:gap-[16px] flex-col">
                    <div className="mobile:flex mobile:items-center mobile:gap-[4px]">
                      {(!existingData.integration ||
                        !!existingData.siblings?.length) && <SelectCurrent />}
                      {!existingData.integration && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMobileSheet('channels')}
                            aria-label={t('select_channels', 'Select Channels')}
                            className="hidden mobile:flex shrink-0 w-[44px] h-[44px] rounded-[8px] bg-btnSimple justify-center items-center focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <PlusIcon size={24} />
                          </button>
                          <div className="hidden mobile:block flex-1" />
                          {previewButton}
                          {settingsButton}
                        </>
                      )}
                    </div>
                    {/* min-w-0: the outermost item of the editor's flex chain.
                        The rest are in editor.tsx — see the note at its :363. */}
                    <div
                      className={clsx(
                        'flex-1 flex min-w-0',
                        mobileTab === 'preview' && 'mobile:hidden'
                      )}
                    >
                      {!hide && <EditorWrapper totalPosts={1} value="" />}
                    </div>
                    <div
                      id="social-empty"
                      className={clsx(
                        'pb-[16px] mobile:pb-0'
                        // current !== 'global' && 'hidden'
                      )}
                    />
                  </div>
                </div>
              </div>
              {showSettings && (
                <div
                  onClick={() => setShowSettings(false)}
                  className="hidden mobile:block fixed inset-0 z-[599] bg-popup backdrop-blur-[8px] animate-fadeIn touch-none"
                />
              )}
              {/* At 1025px and below this is hidden through its card, not
                  itself: a provider with settings shows it in global mode with
                  `display: flex !important` on this id. */}
              <div
                id="wrapper-settings"
                ref={settingsPane}
                // a modal dialog only while it is the sheet; from 1026px up it
                // is the inline panel
                role={settingsSheet ? 'dialog' : undefined}
                aria-modal={settingsSheet ? true : undefined}
                aria-labelledby={settingsSheet ? paneTitleId : undefined}
                tabIndex={settingsSheet ? -1 : undefined}
                onKeyDown={
                  settingsSheet
                    ? (e) => {
                        if (e.key !== 'Escape') {
                          keepPaneTabInside(e);
                          return;
                        }
                        // the composer's own Escape listens on the same node
                        // as React (Next hydrates the document)
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        setShowSettings(false);
                      }
                    : undefined
                }
                className={clsx(
                  'pb-[20px] px-[20px] select-none mobile:p-0',
                  showSettings &&
                    'flex-1 flex pt-[20px] mobile:fixed mobile:inset-x-0 mobile:bottom-0 mobile:z-[600] mobile:max-h-[90%]',
                  current === 'global' && 'hidden'
                )}
              >
                <div
                  className={clsx(
                    'flex-1 flex flex-col rounded-[12px] gap-[12px] overflow-hidden bg-newSettings mobile:rounded-none mobile:rounded-t-[24px] mobile:gap-0 mobile:pt-[8px] mobile:pb-[24px] mobile:bg-newBgColorInner mobile:animate-fade',
                    !showSettings && 'mobile:hidden'
                  )}
                >
                  <div className="hidden mobile:contents">
                    <BottomSheetHeader
                      title={currentIntegrationText}
                      titleId={paneTitleId}
                      onClose={() => setShowSettings(false)}
                    />
                  </div>
                  <div
                    onClick={() => setShowSettings(!showSettings)}
                    className={clsx(
                      'bg-brandSoft2 border border-transparent rounded-[12px] flex items-center gap-[8px] cursor-pointer p-[12px] mobile:hidden',
                      showSettings ? '!rounded-b-none' : ''
                    )}
                  >
                    <div className="flex-1 text-[14px] font-[600] text-brandText">
                      {currentIntegrationText}
                    </div>
                    <div>
                      <ChevronDownIcon
                        rotated={showSettings}
                        className="text-brandText"
                      />
                    </div>
                  </div>
                  <div
                    className={clsx(
                      !showSettings ? 'hidden' : 'flex-1',
                      'text-[14px] text-textColor font-[500] relative mobile:min-h-0 mobile:overflow-y-auto mobile:overscroll-contain'
                    )}
                  >
                    <div className="absolute mobile:static left-0 top-0 w-full h-full mobile:h-auto flex flex-col overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner">
                      <div
                        id="social-settings"
                        className="flex flex-col gap-[20px] bg-newBgColor mobile:bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="hidden mobile:contents">
                    <BottomSheetButton
                      label={t('done', 'Done')}
                      onClick={() => setShowSettings(false)}
                    />
                  </div>
                  <style>
                    {`#social-settings [data-id="${current}"] {display: block !important;}`}
                  </style>
                </div>
              </div>
            </div>
          </div>
          <div
            className={clsx(
              // 580 fixed is the single biggest term in compose's width. At
              // 1025px and below the preview replaces the editor instead.
              'w-[580px] flex flex-col',
              'mobile:!w-full mobile:flex-1',
              mobileTab === 'edit' && 'mobile:hidden'
            )}
          >
            <div className="mobile:hidden bg-newBgColor h-[65px] rounded-e-[20px] !rounded-b-[0] flex items-center px-[20px] text-[20px] font-[600]">
              <div className="flex-1">{t('post_preview', 'Post Preview')}</div>
              {/* The handler was on the icon while cursor-pointer was on this
                  wrapper, so the measured box and the tap target were two
                  different elements. Both belong on the wrapper — the icon
                  click still reaches askClose by bubbling. */}
              <div
                onClick={askClose}
                className="cursor-pointer coarse:w-[44px] coarse:h-[44px] coarse:flex coarse:items-center coarse:justify-center"
              >
                <CloseIcon className="text-muted" />
              </div>
            </div>
            <div className="flex-1 relative bg-panel mobile:bg-transparent">
              <Scrollable
                scrollClasses="!pe-[20px]"
                className="absolute mobile:static top-0 p-[20px] pe-[8px] mobile:p-[16px] left-0 w-full h-full mobile:h-auto overflow-x-hidden overflow-y-auto mobile:overflow-y-visible scrollbar scrollbar-thumb-newColColor scrollbar-track-panel"
              >
                <ShowAllProviders ref={ref} />
              </Scrollable>
            </div>
          </div>
        </div>
        {/* the top bar and the sheets take its place at 1025px and below */}
        <div className="select-none h-[84px] py-[20px] border-t border-newBorder flex items-center mobile:hidden">
          <div className="flex-1 flex ps-[20px] gap-[8px]">
            {/* one tags control at a time: the Add Tag sheet has its own */}
            {!dummy && mobileSheet !== 'tags' && (
              <TagsComponent
                name="tags"
                label={t('tags', 'Tags')}
                initial={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                }}
              />
            )}

            {!dummy && (
              <RepeatComponent repeat={repeater} onChange={setRepeater} />
            )}
          </div>
          <div className="pe-[20px] flex items-center justify-end gap-[8px]">
            {existingData?.integration && (
              <button
                onClick={deletePost}
                className="cursor-pointer flex coarse:min-h-[44px] text-error gap-[8px] items-center text-[15px] font-[600]"
              >
                <div>
                  <TrashIcon />
                </div>
                <div>{t('delete_post', 'Delete Post')}</div>
              </button>
            )}
            {/* The date picker's row carries flex-1; inside this wrapper it
                does not grow, which is how the bar has laid out since the
                wrapper came in. */}
            <div>
              <DatePicker onChange={setPickerDate} date={pickerDate} />
            </div>
            {!addEditSets && (
              <button
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
                className="relative cursor-pointer disabled:cursor-not-allowed px-[20px] h-[44px] bg-btnSimple justify-center items-center flex rounded-[8px] text-[15px] font-[600]"
              >
                {loading && (
                  <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                    <div className="animate-spin h-[20px] w-[20px] border-4 border-textColor border-t-transparent rounded-full" />
                  </div>
                )}
                <div className={clsx(loading && 'invisible')}>
                  {t('save_as_draft', 'Save as Draft')}
                </div>
              </button>
            )}
            {addEditSets && (
              <button
                className="text-white text-[15px] font-[600] min-w-[180px] btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center h-[44px] rounded-[8px] bg-brand ps-[20px] pe-[16px]"
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
              >
                {t('save_set', 'Save Set')}
              </button>
            )}
            {!addEditSets && (
              // The tooltip sits on the wrapper, not the buttons: a disabled
              // button emits no pointer events, so an anchor on it would never
              // fire.
              <div
                className="group cursor-pointer relative"
                data-tooltip-id={publishBlocked ? 'tooltip' : undefined}
                data-tooltip-content={
                  publishBlocked ? blockedReasons.join('\n') : undefined
                }
                data-tooltip-class-name={
                  publishBlocked ? 'whitespace-pre-line' : undefined
                }
              >
                <button
                  disabled={
                    selectedIntegrations.length === 0 ||
                    loading ||
                    locked ||
                    publishBlocked
                  }
                  onClick={schedule('schedule')}
                  className="text-white relative min-w-[180px] btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center h-[44px] rounded-[8px] bg-brand ps-[20px] pe-[16px]"
                >
                  {loading && (
                    <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                      <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
                    </div>
                  )}
                  <div
                    className={clsx(
                      'text-[15px] font-[600]',
                      loading && 'invisible'
                    )}
                  >
                    {selectedIntegrations.length === 0
                      ? t('check_circles_above', 'Check the circles above')
                      : scheduleLabel}
                  </div>
                  {!dummy && (
                    <div className="flex justify-center items-center h-[20px] w-[20px] pt-[4px] arrow-change">
                      <DropdownArrowSmallIcon className="group-hover:rotate-180 text-white" />
                    </div>
                  )}
                </button>

                {!dummy && (
                  <button
                    onClick={schedule('now')}
                    disabled={
                      selectedIntegrations.length === 0 ||
                      loading ||
                      locked ||
                      publishBlocked
                    }
                    className="rounded-[8px] z-[300] disabled:cursor-not-allowed disabled:opacity-80 hidden group-hover:flex absolute bottom-[100%] start-0 pb-[8px] w-full"
                  >
                    <div className="text-brandText rounded-[8px] bg-surface border border-brandText h-[44px] w-full flex justify-center items-center post-now">
                      {t('post_now', 'Post Now')}
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {mobileSheet === 'channels' && (
        <BottomSheet
          title={t('select_channels', 'Select Channels')}
          onClose={() => setMobileSheet(null)}
          button={{
            label: t('done', 'Done'),
            onClick: () => setMobileSheet(null),
            disabled: selectedIntegrations.length === 0,
          }}
        >
          {!dummy && (
            <div className="flex pb-[8px] empty:hidden">
              <SelectCustomer
                onChange={changeCustomer}
                integrations={integrations}
              />
            </div>
          )}
          <PicksSocialsComponent list={true} />
        </BottomSheet>
      )}
      {/* A locked composer keeps the sheets' controls inert, as it does the
          channel grid: a disabled fieldset disables every control in it. */}
      {mobileSheet === 'settings' && (
        <BottomSheet
          title={t('settings', 'Settings')}
          onClose={() => setMobileSheet(null)}
        >
          <fieldset
            disabled={locked}
            className="min-w-0 flex flex-col gap-[12px] pb-[30px]"
          >
            {hasChannelSettings && (
              <BottomSheetRow
                icon={<SettingsOutlineIcon size={24} />}
                label={
                  current === 'global'
                    ? t('channels_settings', 'Channel Settings')
                    : t('channel_name_settings', '{{name}} Settings', {
                        name: isolate(
                          integrations.find((p) => p.id === current)?.name
                        ),
                        interpolation: { escapeValue: false },
                      })
                }
                onClick={() => {
                  setMobileSheet(null);
                  setShowSettings(true);
                }}
              />
            )}
            <BottomSheetRow
              icon={<TagIcon width={24} height={24} />}
              label={t('add_tag', 'Add Tag')}
              onClick={() => setMobileSheet('tags')}
            />
            <BottomSheetRow
              icon={<RepeatIcon size={24} />}
              label={t('repeat_post', 'Repeat Post')}
              onClick={() => setMobileSheet('repeat')}
            />
            {existingData?.integration && (
              <button
                type="button"
                onClick={deletePost}
                className="w-full min-h-[44px] flex items-center gap-[12px] py-[8px] text-start text-error rounded-[8px] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand"
              >
                <TrashIcon size={24} />
                <span className="text-[15px] font-[600]">
                  {t('delete_post', 'Delete Post')}
                </span>
              </button>
            )}
          </fieldset>
        </BottomSheet>
      )}
      {mobileSheet === 'tags' && (
        <BottomSheet
          title={t('add_tag', 'Add Tag')}
          onClose={() => setMobileSheet(null)}
          button={{
            label: t('done', 'Done'),
            onClick: () => setMobileSheet(null),
          }}
        >
          <fieldset disabled={locked} className="min-w-0">
            <TagsComponent
              name="tags"
              label={t('tags', 'Tags')}
              initial={tags}
              onChange={(e) => {
                setTags(e.target.value);
              }}
              list={true}
            />
          </fieldset>
        </BottomSheet>
      )}
      {mobileSheet === 'repeat' && (
        <BottomSheet
          title={t('repeat_post', 'Repeat Post')}
          onClose={() => setMobileSheet(null)}
          button={{
            label: t('done', 'Done'),
            onClick: () => setMobileSheet(null),
          }}
        >
          <fieldset disabled={locked} className="min-w-0">
            <RepeatComponent
              repeat={repeater}
              onChange={setRepeater}
              list={true}
            />
          </fieldset>
        </BottomSheet>
      )}
      {mobileSheet === 'date' && (
        <BottomSheet
          title={t('change_date_or_time', 'Change Date or Time')}
          onClose={() => setMobileSheet(null)}
          button={{
            label: t('save', 'Save'),
            onClick: () => {
              setPickerDate(dateDraft);
              setMobileSheet(null);
            },
            disabled: locked,
          }}
        >
          <fieldset disabled={locked} className="min-w-0">
            <DatePickerPanel
              date={dateDraft}
              onChange={setDateDraft}
              sheet={true}
            />
          </fieldset>
        </BottomSheet>
      )}
      <CopilotPopup
        // clear of the pinned tool bar and of the Post menu at 1025px and below
        className="mobile:!z-[460] mobile:!bottom-[112px]"
        hitEscapeToClose={false}
        clickOutsideToClose={true}
        instructions={`
You are an assistant that help the user to schedule their social media posts,
Here are the things you can do:
- Add a new comment / post to the list of posts
- Delete a comment / post from the list of posts
- Add content to the comment / post
- Activate or deactivate the comment / post

Post content can be added using the addPostContentFor{num} function.
After using the addPostFor{num} it will create a new addPostContentFor{num+ 1} function.
`}
        labels={{
          // The eight the window renders that CopilotKit would otherwise fill from
          // its own English. First, so this surface's own two below always win.
          ...assistantLabels(t),
          title: t('your_assistant', 'Your Assistant'),
          initial: t(
            'assistant_initial_message',
            'Hi! I can help you to refine your social media posts.'
          ),
        }}
      />
    </div>
  );
};

const Scrollable: FC<{
  className: string;
  scrollClasses: string;
  children: ReactNode;
}> = ({ className, scrollClasses, children }) => {
  const ref = useRef(undefined);
  const hasScroll = useHasScroll(ref);
  return (
    <div className={clsx(className, hasScroll && scrollClasses)} ref={ref}>
      {children}
    </div>
  );
};
