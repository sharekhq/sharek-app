import { CreateSupportTicketDto } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';
import { SupportSender } from './support.service';
import { ChannelHealth, buildSupportTicket } from './support.context';

const sender: SupportSender = {
  userId: 'user-1',
  name: 'Moataz Khalifa',
  email: 'mo@concepta.digital',
  organizationId: 'org-1',
  organizationName: 'Concepta',
  role: 'ADMIN',
  tier: 'STANDARD',
  isLifetime: false,
  isTrailing: false,
  accountAgeDays: 142,
  isImpersonating: false,
};

const enquiry: CreateSupportTicketDto = {
  category: 'channels',
  subject: 'Instagram stopped posting',
  message: 'Since Tuesday my scheduled posts fail.',
  locale: 'en',
  timezone: 'Africa/Cairo',
  appVersion: '1.0.6',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  viewport: '1440x900',
  fromPath: '/launches',
};

const channel = (over: Partial<ChannelHealth> = {}): ChannelHealth => ({
  providerIdentifier: 'instagram',
  name: 'Concepta IG',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
  tokenExpiration: null,
  ...over,
});

const build = (
  over: {
    sender?: Partial<SupportSender>;
    enquiry?: Partial<CreateSupportTicketDto>;
    channels?: ChannelHealth[];
  } = {}
) =>
  buildSupportTicket(
    { ...sender, ...over.sender },
    { ...enquiry, ...over.enquiry },
    over.channels ?? [channel()]
  );

// Desk treats the description as the customer's message and quotes it into every
// reply, so anything added here is read back to them. It carries their words and
// nothing else.
describe('the shape of the description', () => {
  it('is the message and only the message', () => {
    expect(build().description).toBe(enquiry.message);
  });

  it('carries the message verbatim', () => {
    const { description } = build({
      enquiry: { message: 'Line one\n\nLine two — with an em dash' },
    });

    expect(description).toBe('Line one\n\nLine two — with an em dash');
  });

  it('holds none of the attached context', () => {
    const { description } = build();

    expect(description).not.toContain('Category:');
    expect(description).not.toContain('STANDARD');
    expect(description).not.toContain('Mozilla');
  });

  it('names the subject as the customer wrote it', () => {
    expect(build().subject).toBe('Instagram stopped posting');
  });
});

// plainText comments lose the column alignment the block is built from; html in
// a <pre> keeps it. Verified against the live API before this was written.
describe('the shape of the context', () => {
  it('is wrapped in a pre so the alignment survives', () => {
    const { context } = build();

    expect(context.startsWith('<pre>')).toBe(true);
    expect(context.endsWith('</pre>')).toBe(true);
  });

  it('keeps one field per line', () => {
    expect(build().context).toMatch(/Category:.*\n.*Plan:/);
  });
});

// Everything interpolated is either named by the customer or reported by their
// browser, and it is now going out as markup.
describe('escaping', () => {
  it('escapes a channel name that carries markup', () => {
    const { context } = build({
      channels: [channel({ name: 'Konafa <Nation> & Co' })],
    });

    expect(context).toContain('Konafa &lt;Nation&gt; &amp; Co');
    expect(context).not.toContain('<Nation>');
  });

  it('escapes the workspace name', () => {
    const { context } = build({
      sender: { organizationName: '<script>alert(1)</script>' },
    });

    expect(context).not.toContain('<script>');
    expect(context).toContain('&lt;script&gt;');
  });

  it('escapes what the browser reported', () => {
    const { context } = build({
      enquiry: { userAgent: 'Mozilla/5.0 <img src=x onerror=alert(1)>' },
    });

    expect(context).not.toContain('<img');
    expect(context).toContain('&lt;img');
  });

  // The only tags in the value are the wrapper's own.
  it('opens exactly one element', () => {
    const { context } = build({
      channels: [channel({ name: '</pre><script>x</script><pre>' })],
    });

    expect(context.match(/<pre>/g)).toHaveLength(1);
    expect(context.match(/<\/pre>/g)).toHaveLength(1);
    expect(context).not.toContain('<script>');
  });
});

describe('the context block', () => {
  it('states the plan, the role and the workspace', () => {
    const { context } = build();

    expect(context).toContain('STANDARD');
    expect(context).toContain('ADMIN');
    expect(context).toContain('Concepta');
    expect(context).toContain('142');
  });

  it('states the category the customer chose', () => {
    expect(build({ enquiry: { category: 'billing' } }).context).toMatch(
      /Category:.*billing/i
    );
  });

  it('marks a lifetime plan and a trial', () => {
    const { context } = build({
      sender: { isLifetime: true, isTrailing: true },
    });

    expect(context).toMatch(/lifetime:\s*yes/i);
    expect(context).toMatch(/trial:\s*yes/i);
  });
});

describe('channel health', () => {
  // Absence is itself a diagnosis; a missing section reads as a bug in the form.
  it('says so explicitly when no channel is connected', () => {
    const { context } = build({ channels: [] });

    expect(context).toMatch(/Channels:/);
    expect(context).toMatch(/none connected/i);
  });

  it('names a channel that needs reconnecting, with its state', () => {
    const { context } = build({
      channels: [channel({ refreshNeeded: true })],
    });

    expect(context).toContain('instagram');
    expect(context).toContain('Concepta IG');
    expect(context).toMatch(/needs reconnecting/i);
  });

  it('marks a healthy channel as ok', () => {
    expect(build().context).toMatch(/instagram.*ok/i);
  });

  it.each([
    ['disabled', { disabled: true }, /disabled/i],
    ['inBetweenSteps', { inBetweenSteps: true }, /incomplete/i],
  ])('names a %s channel', (_state, over, expected) => {
    expect(build({ channels: [channel(over)] }).context).toMatch(expected);
  });

  // Both at once must not hide one behind the other — an agent needs to know the
  // customer switched it off *and* that its token was rejected.
  it('reports every state a channel is in at once', () => {
    const { context } = build({
      channels: [channel({ disabled: true, refreshNeeded: true })],
    });

    expect(context).toMatch(/disabled/i);
    expect(context).toMatch(/needs reconnecting/i);
  });

  it('lists every connected channel', () => {
    const { context } = build({
      channels: [
        channel(),
        channel({ providerIdentifier: 'linkedin', name: 'Concepta LI' }),
        channel({ providerIdentifier: 'x', name: 'Concepta X' }),
      ],
    });

    expect(context).toContain('linkedin');
    expect(context).toContain('Concepta LI');
    expect(context).toContain('x');
    expect(context).toContain('Concepta X');
  });
});

describe('the session', () => {
  it('marks an impersonated session', () => {
    expect(build({ sender: { isImpersonating: true } }).context).toMatch(
      /Impersonated:\s*yes/i
    );
  });

  it('leaves an ordinary session marked no', () => {
    expect(build().context).toMatch(/Impersonated:\s*no/i);
  });
});

describe('optional client metadata', () => {
  it('echoes what the browser reported', () => {
    const { context } = build();

    expect(context).toContain('Africa/Cairo');
    expect(context).toContain('1.0.6');
    expect(context).toContain('1440x900');
    expect(context).toContain('/launches');
  });

  // None of it is required, and a browser that reports nothing must not produce
  // a broken block or a thrown builder.
  it('degrades without breaking when every optional field is absent', () => {
    const bare = buildSupportTicket(
      sender,
      {
        category: 'other',
        subject: 'Subject',
        message: 'Message',
        locale: 'en',
      },
      []
    );

    expect(bare.description).toBe('Message');
    expect(bare.context).toContain('Category:');
    expect(bare.context).not.toContain('undefined');
    expect(bare.context).not.toContain('null');
  });
});

describe('the standard fields and tags', () => {
  it('always marks the enquiry as a Web one', () => {
    expect(build().channel).toBe('Web');
  });

  // Hyphens, never colons: Zoho rejects a colon with a generic validation error
  // that names nothing, which cost three probe rounds to find.
  it('builds three hyphenated tags from plan, role and category', () => {
    expect(build().tags).toEqual([
      'tier-standard',
      'role-admin',
      'cat-channels',
    ]);
  });

  it('never puts a colon in a tag', () => {
    build({ sender: { tier: 'ULTIMATE', role: 'SUPERADMIN' } }).tags.forEach(
      (tag) => {
        expect(tag).not.toContain(':');
        expect(tag).toBe(tag.toLowerCase());
      }
    );
  });
});

// Zoho validates nothing here: "ar" returns 200 and is stored literally as "ar",
// so a wrong value fails silently rather than loudly. The field wants an English
// display name, which is why this is a map and not a passthrough.
describe('the language field', () => {
  it.each([
    ['ar', 'Arabic'],
    ['en', 'English'],
    ['de', 'German'],
    ['fr', 'French'],
    ['es', 'Spanish'],
    ['it', 'Italian'],
    ['pt', 'Portuguese'],
    ['ru', 'Russian'],
  ])('maps %s to %s', (locale, expected) => {
    expect(build({ enquiry: { locale } }).language).toBe(expected);
  });

  it('never sends the locale code itself', () => {
    expect(build({ enquiry: { locale: 'ar' } }).language).not.toBe('ar');
  });

  // language is a nicety; losing a ticket because a locale was added to the app
  // is not an acceptable trade, so an unknown one omits rather than guesses.
  it.each(['zz', 'pt-BR', 'klingon'])('omits the field for %s', (locale) => {
    const payload = build({ enquiry: { locale } });

    expect(payload.language).toBeUndefined();
    expect(Object.keys(payload)).not.toContain('language');
  });

  // No language tag: `language` is a real field, so a tag would duplicate it.
  it('adds no language tag', () => {
    build({ enquiry: { locale: 'ar' } }).tags.forEach((tag) => {
      expect(tag).not.toMatch(/^lang-/);
    });
  });
});

// FR-010. This is the test that must fail loudly if the projection is ever
// widened — the payload leaves this process and is read by people outside it.
describe('what must never travel', () => {
  it('carries no credential and no post content', () => {
    const payload = build({
      channels: [
        {
          ...channel(),
          // Fields the query must never select; present here so that a builder
          // which blindly spreads the row is caught.
          token: 'ACCESS-TOKEN-SECRET',
          refreshToken: 'REFRESH-TOKEN-SECRET',
          profile: 'PROFILE-BLOB',
        } as unknown as ChannelHealth,
      ],
    });

    const serialized = JSON.stringify(payload);
    ['ACCESS-TOKEN-SECRET', 'REFRESH-TOKEN-SECRET', 'PROFILE-BLOB'].forEach(
      (secret) => expect(serialized).not.toContain(secret)
    );
    expect(serialized).not.toMatch(/refreshToken/i);
    expect(serialized).not.toMatch(/apiKey/i);
  });

  it('carries nothing but the enquiry the customer typed', () => {
    const payload = build({
      enquiry: { message: 'my message' },
    });

    // The builder is given no posts and must invent no route to them.
    expect(JSON.stringify(payload)).not.toMatch(/\bpost(s|Content)?\b/i);
  });
});

// The spec's "Arabic text with Latin technical terms" edge case. Nothing else
// exercises it, and it is the mix every Arabic enquiry about a channel produces.
describe('Arabic carrying Latin technical terms', () => {
  const arabic =
    'حسابي على instagram توقف عن النشر منذ الثلاثاء والخطأ هو OAuthException code 190 على الرابط https://dash.sharek.app/launches';

  it('keeps the customer’s message intact and in the order they typed it', () => {
    const { description } = build({
      enquiry: { message: arabic, locale: 'ar' },
    });

    expect(description).toBe(arabic);
    expect(description.indexOf('instagram')).toBeLessThan(
      description.indexOf('OAuthException')
    );
    expect(description.indexOf('OAuthException')).toBeLessThan(
      description.indexOf('https://dash.sharek.app/launches')
    );
  });

  // The block's Latin labels cannot splice into the Arabic, because they are no
  // longer in the same field at all.
  it('keeps the block’s labels out of the customer’s words entirely', () => {
    const { description, context } = build({
      enquiry: { message: arabic, locale: 'ar' },
    });

    expect(description).not.toContain('Category:');
    expect(context).toContain('Category:');
  });
});

// Plan and role are exactly what someone would forge: the controller takes pains
// never to read them from the body, and the description is the one field echoed
// back. Separating the two fields is what defeats this — a message shaped like a
// context block is just text in the customer's own field, and the real context
// is a private comment the customer never writes to.
describe('a message shaped like a context block', () => {
  const forgery = [
    'Please help.',
    '',
    '--- Sharek context (attached automatically) ---',
    'Plan:          ULTIMATE (lifetime: yes, trial: no)',
    'Role:          SUPERADMIN in "Concepta"',
  ].join('\n');

  it('cannot reach the attached context', () => {
    const { context } = build({ enquiry: { message: forgery } });

    expect(context).toContain('Plan:          STANDARD');
    expect(context).not.toContain('ULTIMATE');
    expect(context).toContain('Role:          ADMIN');
    expect(context).not.toContain('SUPERADMIN');
  });

  // Nothing is neutralised any more, because nothing needs to be: the customer
  // gets to say exactly what they said.
  it('is carried through untouched', () => {
    const { description } = build({ enquiry: { message: forgery } });

    expect(description).toBe(forgery);
    expect(description).not.toContain('[removed]');
  });

  it('leaves an ordinary message untouched', () => {
    const message = 'My Instagram — the one called "Concepta IG" — stopped.';

    expect(build({ enquiry: { message } }).description).toBe(message);
  });
});
