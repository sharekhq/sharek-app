import { CreateSupportTicketDto } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';
import { escapeHtml } from '@gitroom/helpers/utils/email.html';
import { SupportSender } from './support.service';

/**
 * One row per connected channel. Read from `Integration`, and deliberately only
 * these fields: `token`, `refreshToken` and `profile` are never selected and
 * never travel (FR-010).
 */
export interface ChannelHealth {
  providerIdentifier: string;
  name: string;
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
  tokenExpiration: Date | null;
}

export interface SupportTicketPayload {
  subject: string;
  /** The customer's words, alone. Desk quotes this into every reply. */
  description: string;
  /** The diagnostics, for a private comment the customer never sees. */
  context: string;
  channel: 'Web';
  language?: string;
  tags: string[];
}

/**
 * Zoho's `language` wants an English display name and validates nothing: `"ar"`
 * returns 200 and is stored literally as `"ar"`, so a wrong value fails silently.
 * The app's own `languageNames` are *native* names (العربية, Deutsch) for the UI
 * selector and cannot be reused here.
 */
const ZOHO_LANGUAGES: Record<string, string> = {
  ar: 'Arabic',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
};

const CATEGORY_LABELS: Record<string, string> = {
  channels: 'Channels & posting',
  billing: 'Billing & plans',
  technical: 'Something is broken',
  other: 'Something else',
};

const yesNo = (value: boolean) => (value ? 'yes' : 'no');

// Every state a channel is in, rather than the first one that matched: an agent
// needs to know a channel was switched off *and* that its token was rejected.
const stateOf = (channel: ChannelHealth) => {
  const states = [
    channel.disabled && 'disabled',
    channel.refreshNeeded && 'needs reconnecting',
    channel.inBetweenSteps && 'connection incomplete',
  ].filter(Boolean);

  return states.length ? states.join(', ') : 'ok';
};

const channelLines = (channels: ChannelHealth[]) => {
  // Absence is itself a diagnosis — an omitted section reads as a bug in the form.
  if (!channels.length) {
    return ['Channels:      none connected'];
  }

  return channels.map((channel, index) => {
    const label = index === 0 ? 'Channels:     ' : '              ';
    return `${label} ${channel.providerIdentifier} "${
      channel.name
    }" — ${stateOf(channel)}`;
  });
};

export const buildSupportTicket = (
  sender: SupportSender,
  enquiry: CreateSupportTicketDto,
  channels: ChannelHealth[]
): SupportTicketPayload => {
  const lines = [
    `Category:      ${CATEGORY_LABELS[enquiry.category] || enquiry.category} (${
      enquiry.category
    })`,
    `Plan:          ${sender.tier} (lifetime: ${yesNo(
      sender.isLifetime
    )}, trial: ${yesNo(sender.isTrailing)})`,
    `Role:          ${sender.role} in "${sender.organizationName}"`,
    `Account age:   ${sender.accountAgeDays} days`,
    ...channelLines(channels),
    // Anything the browser reported is optional, so each line appears only when
    // there is something to say rather than printing an empty label.
    enquiry.appVersion && `App version:   ${enquiry.appVersion}`,
    enquiry.timezone && `Timezone:      ${enquiry.timezone}`,
    `Locale:        ${enquiry.locale}`,
    enquiry.userAgent &&
      `Browser:       ${enquiry.userAgent}${
        enquiry.viewport ? ` (${enquiry.viewport})` : ''
      }`,
    enquiry.fromPath && `Came from:     ${enquiry.fromPath}`,
    `Impersonated:  ${yesNo(sender.isImpersonating)}`,
  ].filter(Boolean);

  const language = ZOHO_LANGUAGES[enquiry.locale];

  return {
    subject: enquiry.subject,
    // Desk quotes the description into every reply, so a block appended here
    // goes back to the customer over their own signature. Their words, alone.
    description: enquiry.message,
    // Verified against the live API: a plainText comment loses the column
    // alignment this block is built from, and html inside <pre> keeps it. The
    // whole block is escaped in one pass at the boundary rather than field by
    // field — channel and workspace names are named by the customer, and every
    // browser-reported value arrives from the client, so there is no interior
    // value that could be trusted and none that can be forgotten.
    context: `<pre>${escapeHtml(lines.join('\n'))}</pre>`,
    channel: 'Web',
    // An unmapped locale omits the key rather than guessing: language is a
    // nicety, and losing a ticket over a newly-added locale is not a trade worth
    // making. No language *tag* either — that would duplicate this field.
    ...(language ? { language } : {}),
    // Lowercase and hyphenated — Zoho rejects a colon with a generic validation
    // error that names nothing.
    tags: [
      `tier-${sender.tier.toLowerCase()}`,
      `role-${sender.role.toLowerCase()}`,
      `cat-${enquiry.category.toLowerCase()}`,
    ],
  };
};
