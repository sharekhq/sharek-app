// Guards the strings of the Brands page (spec 053, part 1): the sidebar item,
// the page title, the list, a brand's kit, the colour popover, and the New
// brand and Delete dialogs. The en and ar wording is the approved canvas's
// (version 4, the `T = { en, ar }` table of BrandsList, BrandKit, BrandDialog
// and Main's empty state), with the locale files' straight apostrophe where the
// canvas writes a curly one. Part 1 adds the keys to en and ar only (tasks.md
// T016); the six other languages fall back to English. The words that change
// elsewhere, customer and group becoming brand (board Rename), change in all
// eight languages.
import * as fs from 'fs';
import * as path from 'path';
import { languages } from '@gitroom/react/translation/i18n.config';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const FRONTEND_DIR = path.join(__dirname, '../../../../apps/frontend/src');

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

// [key, en, ar]
const STRINGS = [
  // The sidebar's item, the rail's short word, and the page title, written as
  // the other page titles are.
  ['brands', 'Brands', 'العلامات'],
  ['page_title_brands', 'Sharek Brands', 'شارك — العلامات التجارية'],
  // The start-side list (BrandsList). brands_all_brands names the list and is
  // the phone's link back to it (BrandKit's allBrands). brands_new_brand is
  // also the empty state's button and the New brand dialog's title.
  ['brands_all_brands', 'Brands', 'العلامات التجارية'],
  ['brands_new_brand', 'New brand', 'علامة تجارية جديدة'],
  ['brands_not_in_a_brand', 'Not in a brand', 'خارج العلامات التجارية'],
  ['brands_no_brand', 'No brand', 'بلا علامة تجارية'],
  [
    'brands_list_empty',
    "No brands yet. Give each brand its own logo and look, and Samy uses it for that brand's channels.",
    'لا توجد علامات تجارية بعد. امنح كل علامة شعارها ومظهرها، وسيستخدمها سامي مع قنواتها.',
  ],
  // The page's empty state beside the empty list (board Main).
  [
    'brands_empty_title',
    'Give each brand its own look',
    'امنح كل علامة تجارية مظهرها',
  ],
  [
    'brands_empty_body',
    "Add a logo, a few example posts, colours and fonts. When you pick a brand's channels, Samy and Sharek's AI keep your images in its look.",
    'أضف شعارًا وبعض المنشورات النموذجية والألوان والخطوط. حين تختار قنوات علامة ما، يبقي سامي والذكاء الاصطناعي في شارك صورك على مظهرها.',
  ],
  // A brand's page (BrandKit): the line under its name names Samy and no tool.
  [
    'brands_used_by',
    "Samy and Sharek's AI use this kit to keep your images on-brand.",
    'يستخدم سامي والذكاء الاصطناعي في شارك هذه الهوية لتبقى صورك متسقة مع علامتك.',
  ],
  ['brands_brand_options', 'Brand options', 'خيارات العلامة التجارية'],
  ['brands_delete_brand', 'Delete brand', 'حذف العلامة التجارية'],
  // The Logo card. A missing logo shows brands_deleted_from_media, as a
  // missing example does.
  ['brands_logo', 'Logo', 'الشعار'],
  ['brands_replace', 'Replace', 'استبدال'],
  ['brands_upload_logo', 'Upload logo', 'رفع الشعار'],
  ['brands_no_logo', 'No logo yet', 'لا يوجد شعار بعد'],
  [
    'brands_logo_help',
    'Goes with every image, even when you attach your own.',
    'يرافق كل صورة، حتى حين ترفق صورًا من عندك.',
  ],
  // The Colours card and its popover (ColourPicker).
  ['brands_colours', 'Colours', 'الألوان'],
  ['brands_add_colour', 'Add a colour', 'إضافة لون'],
  ['brands_hex_code', 'Hex code', 'رمز اللون'],
  // A colour's × names the code it removes.
  ['brands_remove_colour', 'Remove colour {{code}}', 'إزالة اللون {{code}}'],
  [
    'brands_colours_help',
    'Up to 6. Samy names them in each image request.',
    'حتى 6 ألوان، يذكرها سامي في كل طلب صورة.',
  ],
  // The Example posts card; brands_examples_help_missing replaces the help
  // line while an example is missing (BrandsMissing).
  ['brands_example_posts', 'Example posts', 'منشورات نموذجية'],
  ['brands_remove_example', 'Remove example', 'إزالة المنشور'],
  ['brands_deleted_from_media', 'Deleted from Media', 'حذفت من الوسائط'],
  [
    'brands_examples_help',
    'Up to 3 posts in your style. They stay out when you attach images of your own.',
    'حتى 3 منشورات بأسلوبك، ولا ترسل حين ترفق صورًا من عندك.',
  ],
  [
    'brands_examples_help_missing',
    'One example was deleted from Media, so Samy skips it until you replace it.',
    'حذف منشور من الوسائط، فيتجاوزه سامي حتى تستبدله.',
  ],
  // The examples' "3 of 3" and the colours' "4 of 6", and either card's count
  // while it holds nothing. No noun is counted, so nothing is plural.
  ['brands_n_of_max', '{{n}} of {{max}}', '{{n}} من {{max}}'],
  ['brands_none_yet', 'None yet', 'لا شيء بعد'],
  // The Channels card: the × on each channel, and the button that adds more.
  [
    'brands_remove_from_brand',
    'Remove from brand',
    'إزالة من العلامة التجارية',
  ],
  ['brands_add_channels', 'Add channels', 'إضافة قنوات'],
  // Add channels opens a picker titled brands_add_channels, with no canvas
  // board: its line on what a pick does, and what it says with nothing left.
  [
    'brands_add_channels_hint',
    'A channel in another brand moves to this one.',
    'تنتقل القناة الموجودة في علامة تجارية أخرى إلى هذه العلامة.',
  ],
  [
    'brands_no_other_channels',
    'No other channels to add.',
    'لا توجد قنوات أخرى لإضافتها.',
  ],
  [
    'brands_channels_help',
    'Tick these channels in Samy and it uses this kit.',
    'حدد هذه القنوات في سامي ليستخدم هذه الهوية.',
  ],
  // The Fonts card.
  ['brands_fonts', 'Fonts', 'الخطوط'],
  ['brands_headings', 'Headings', 'العناوين'],
  ['brands_body_text', 'Body text', 'النص'],
  [
    'brands_fonts_help',
    "Names only: Sharek's AI reads them as words, so well-known fonts work best.",
    'أسماء فقط، فالذكاء الاصطناعي في شارك يقرؤها كلمات، لذا تعمل الخطوط المعروفة أفضل.',
  ],
  [
    'brands_any_member',
    'Anyone in your team can edit this brand.',
    'يستطيع أي عضو في فريقك تعديل هذه العلامة.',
  ],
  // The New brand dialog (BrandsNew). The duplicate-name message is not on
  // the canvas: its English is the API's (contracts/brands-api.md), and the
  // dialog shows it translated (tasks.md T021).
  [
    'brands_move_ungrouped_hint',
    'Offered with your first brand only. You can move channels out later.',
    'يظهر هذا مع علامتك الأولى فقط، ويمكنك نقل القنوات لاحقًا.',
  ],
  ['brands_create_brand', 'Create brand', 'إنشاء العلامة التجارية'],
  [
    'brands_name_taken',
    'A brand with this name already exists.',
    'توجد علامة تجارية بهذا الاسم بالفعل.',
  ],
  // The Delete dialog's title (BrandsDelete).
  ['brands_delete_named', 'Delete {{name}}?', 'حذف {{name}}؟'],
] as const;

// Keys the app already carries whose en and ar are the canvas's words. rename
// keeps the Arabic Samy's chats read, إعادة تسمية, where the canvas writes
// إعادة التسمية, so Rename reads one way across the app.
const REUSED = [
  ['rename', 'Rename', 'إعادة تسمية'],
  ['remove', 'Remove', 'إزالة'],
  ['add', 'Add', 'إضافة'],
  ['cancel', 'Cancel', 'إلغاء'],
  ['channels', 'Channels', 'القنوات'],
  ['name', 'Name', 'الاسم'],
] as const;

// Counted phrases: [key, en by form, ar by form]. en's _one says 1 and ar's
// _zero, _one and _two say the number in words, as media_selection_limit does.
// A brand with no channels can be deleted, so brands_delete_body has an en
// _zero, which i18next reads before _other when the count is 0.
const PLURALS = [
  // "N channels" on each list row and under the brand's name, the Samy chats'
  // own key.
  [
    'channels_count',
    { one: '1 channel', other: '{{count}} channels' },
    {
      zero: 'لا قنوات',
      one: 'قناة واحدة',
      two: 'قناتان',
      few: '{{count}} قنوات',
      many: '{{count}} قناة',
      other: '{{count}} قناة',
    },
  ],
  // The New brand dialog's offer, on the first brand only.
  [
    'brands_move_ungrouped',
    {
      one: 'Move my 1 channel with no brand into it',
      other: 'Move my {{count}} channels with no brand into it',
    },
    {
      zero: 'انقل إليها القنوات التي بلا علامة تجارية',
      one: 'انقل إليها القناة التي بلا علامة تجارية',
      two: 'انقل إليها القناتين اللتين بلا علامة تجارية',
      few: 'انقل إليها القنوات التي بلا علامة تجارية ({{count}} قنوات)',
      many: 'انقل إليها القنوات التي بلا علامة تجارية ({{count}} قناة)',
      other: 'انقل إليها القنوات التي بلا علامة تجارية ({{count}} قناة)',
    },
  ],
  // The Delete dialog's sentence.
  [
    'brands_delete_body',
    {
      zero: 'The logo and example posts stay in your Media library.',
      one: 'Its channel stays connected and moves to No brand. The logo and example posts stay in your Media library.',
      other:
        'Its {{count}} channels stay connected and move to No brand. The logo and example posts stay in your Media library.',
    },
    {
      zero: 'يبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
      one: 'تبقى قناتها متصلة وتنتقل إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
      two: 'تبقى قناتاها متصلتين وتنتقلان إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
      few: 'تبقى قنواتها الـ{{count}} متصلة وتنتقل إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
      many: 'تبقى قنواتها الـ{{count}} متصلة وتنتقل إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
      other:
        'تبقى قنواتها الـ{{count}} متصلة وتنتقل إلى «بلا علامة تجارية»، ويبقى الشعار والمنشورات النموذجية في مكتبة الوسائط.',
    },
  ],
] as const;

// The words that change (contracts/pages-ui.md, board Rename): today's screens
// say customer and group for one thing, and both become brand. Values change
// in all eight languages and the keys stay (research R12). [key, en, ar], the
// canvas's words.
const RENAMED = [
  ['move_add_to_group', 'Move to brand', 'نقل إلى علامة تجارية'],
  ['select_customer_label', 'Brand', 'العلامة التجارية'],
  ['remove_from_customer', 'Remove from brand', 'إزالة من العلامة التجارية'],
  ['customer_updated', 'Brand updated', 'تم تحديث العلامة التجارية'],
  ['edit_group_name', 'Rename brand', 'إعادة تسمية العلامة التجارية'],
  ['group_updated', 'Brand updated', 'تم تحديث العلامة التجارية'],
  [
    'could_not_save_group',
    'Could not save the brand.',
    'تعذر حفظ العلامة التجارية.',
  ],
  ['select_customer', 'Select brand', 'اختر علامة تجارية'],
  ['select_customer_tooltip', 'Select brand', 'اختر علامة تجارية'],
  ['customers', 'Brands', 'العلامات التجارية'],
  [
    'customer_socials_selected',
    "Brand's channels selected",
    'تم اختيار قنوات العلامة التجارية',
  ],
  ['customer', 'Brand:', 'العلامة التجارية:'],
] as const;

const UPSTREAM = ['de', 'fr', 'es', 'it', 'pt', 'ru'] as const;

type Upstream = (typeof UPSTREAM)[number];

// The six upstream languages' values before the rename, copied from the files.
// select_customer and customer_socials_selected are in en and ar only, so the
// six read them in English today.
const BEFORE: Record<string, Partial<Record<Upstream, string>>> = {
  move_add_to_group: {
    de: 'Verschieben / Zur Gruppe hinzufügen',
    fr: 'Déplacer / ajouter au groupe',
    es: 'Mover / agregar al grupo',
    it: 'Sposta / aggiungi al gruppo',
    pt: 'Mover / adicionar ao grupo',
    ru: 'Переместить / добавить в группу',
  },
  select_customer_label: {
    de: 'Kunden auswählen',
    fr: 'Sélectionner un client',
    es: 'Seleccionar cliente',
    it: 'Seleziona cliente',
    pt: 'Selecionar cliente',
    ru: 'Выберите клиента',
  },
  remove_from_customer: {
    de: 'Vom Kunden entfernen',
    fr: 'Retirer du client',
    es: 'Eliminar del cliente',
    it: 'Rimuovi dal cliente',
    pt: 'Remover do cliente',
    ru: 'Удалить от клиента',
  },
  customer_updated: {
    de: 'Kunde aktualisiert',
    fr: 'Client mis à jour',
    es: 'Cliente actualizado',
    it: 'Cliente aggiornato',
    pt: 'Cliente Atualizado',
    ru: 'Клиент обновлён',
  },
  edit_group_name: {
    de: 'Gruppennamen bearbeiten',
    fr: 'Modifier le nom du groupe',
    es: 'Editar nombre del grupo',
    it: 'Modifica nome del gruppo',
    pt: 'Editar nome do grupo',
    ru: 'Редактировать имя группы',
  },
  group_updated: {
    de: 'Gruppe aktualisiert',
    fr: 'Groupe mis à jour',
    es: 'Grupo actualizado',
    it: 'Gruppo aggiornato',
    pt: 'Grupo atualizado',
    ru: 'Группа обновлена',
  },
  could_not_save_group: {
    de: 'Die Gruppe konnte nicht gespeichert werden.',
    fr: "Impossible d'enregistrer le groupe.",
    es: 'No se pudo guardar el grupo.',
    it: 'Impossibile salvare il gruppo.',
    pt: 'Não foi possível salvar o grupo.',
    ru: 'Не удалось сохранить группу.',
  },
  select_customer: {},
  select_customer_tooltip: {
    de: 'Kunden auswählen',
    fr: 'Sélectionner un client',
    es: 'Seleccionar cliente',
    it: 'Seleziona cliente',
    pt: 'Selecionar cliente',
    ru: 'Выберите клиента',
  },
  customers: {
    de: 'Kunden',
    fr: 'Clients',
    es: 'Clientes',
    it: 'Clienti',
    pt: 'Clientes',
    ru: 'Клиенты',
  },
  customer_socials_selected: {},
  customer: {
    de: 'Kunde:',
    fr: 'Client :',
    es: 'Cliente:',
    it: 'Cliente:',
    pt: 'Cliente:',
    ru: 'Клиент:',
  },
};

// Each language's word for brand, by its stem, so the forms a sentence needs
// pass: Marken, marques, marchi, бренда.
const BRAND_WORD: Record<Upstream, RegExp> = {
  de: /marke/i,
  fr: /marque/i,
  es: /marca/i,
  it: /marchi/i,
  pt: /marca/i,
  ru: /бренд/iu,
};

// Unchanged in all eight (tasks.md C13): the invite link goes to a person, and
// label_group is MeWe's Group, a different thing, in en and ar only.
const UNCHANGED: Record<string, Record<string, string | undefined>> = {
  invite_a_customer: {
    en: 'Invite a customer',
    ar: 'دعوة عميل',
    de: 'Kunden einladen',
    fr: 'Inviter un client',
    es: 'Invitar a un cliente',
    it: 'Invita un cliente',
    pt: 'Convidar um cliente',
    ru: 'Пригласить клиента',
  },
  label_group: { en: 'Group', ar: 'مجموعة' },
};

// i18next 25 reads <key>_<category>, the category Intl.PluralRules picks for
// the count (and <key>_zero first when the count is 0), so a language missing
// one of its forms renders that count in English.
const forms = (lng: string) =>
  new Intl.PluralRules(lng).resolvedOptions().pluralCategories;

// The files that render these strings: the Brands components (their specs
// aside), the page, which sets the title, and the sidebar. A file not written
// yet reads as empty, so its keys fail to be found rather than the suite
// failing to load.
const SOURCES = () => {
  const brandsDir = path.join(FRONTEND_DIR, 'components/brands');
  const components = fs.existsSync(brandsDir)
    ? fs
        .readdirSync(brandsDir)
        .filter((file) => /\.tsx?$/.test(file) && !/\.spec\./.test(file))
        .map((file) => path.join(brandsDir, file))
    : [];
  return [
    ...components,
    path.join(FRONTEND_DIR, 'app/(app)/(site)/brands/page.tsx'),
    path.join(FRONTEND_DIR, 'components/layout/top.menu.tsx'),
  ]
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
};

describe('Brands page locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each(STRINGS)(
    'reads %s as "%s" in en and "%s" in ar',
    (key, enText, arText) => {
      expect(en[key]).toBe(enText);
      expect(ar[key]).toBe(arText);
    }
  );

  it.each(REUSED)(
    'reads the existing %s as "%s" in en and "%s" in ar',
    (key, enText, arText) => {
      expect(en[key]).toBe(enText);
      expect(ar[key]).toBe(arText);
    }
  );

  it.each(PLURALS)(
    'reads %s in every plural form en and ar have, as the canvas words it',
    (key, enForms, arForms) => {
      expect(Object.keys(enForms)).toEqual(expect.arrayContaining(forms('en')));
      expect(Object.keys(arForms)).toEqual(expect.arrayContaining(forms('ar')));
      for (const [form, text] of Object.entries(enForms)) {
        expect(en[`${key}_${form}`]).toBe(text);
      }
      for (const [form, text] of Object.entries(arForms)) {
        expect(ar[`${key}_${form}`]).toBe(text);
      }
    }
  );

  // Identical bytes in both locales means the English was copied across rather
  // than translated, which reads as done and is not.
  it.each([...STRINGS, ...REUSED].map(([key]) => key))(
    'translates %s: its Arabic is not its English',
    (key) => {
      expect(typeof ar[key]).toBe('string');
      expect(ar[key]).not.toBe(en[key]);
    }
  );

  it.each(PLURALS.map(([key]) => key))(
    'translates %s: no Arabic form is an English one',
    (key) => {
      const english = Object.keys(en)
        .filter((name) => name.startsWith(`${key}_`))
        .map((name) => en[name]);
      for (const form of forms('ar')) {
        expect(typeof ar[`${key}_${form}`]).toBe('string');
        expect(english).not.toContain(ar[`${key}_${form}`]);
      }
    }
  );

  // Red until the components exist (T018 to T026): a key no t() call reads is
  // a string the page shows in English or not at all.
  describe('every string the page renders', () => {
    const referenced = Array.from(
      SOURCES().matchAll(
        /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*'([A-Za-z0-9_]+)'/g
      ),
      (match) => match[1]
    );

    it.each([...STRINGS, ...REUSED, ...PLURALS].map(([key]) => key))(
      'is read by a t() call in the Brands page or the sidebar: %s',
      (key) => {
        expect(referenced).toContain(key);
      }
    );
  });
});

describe('the words that change: customer and group become brand', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(RENAMED)(
    'rewords %s as "%s" in en and "%s" in ar',
    (key, enText, arText) => {
      expect(locales.en[key]).toBe(enText);
      expect(locales.ar[key]).toBe(arText);
    }
  );

  // Rewording en and ar alone would leave the six saying customer and group,
  // or, for a key they lack, English.
  it.each(UPSTREAM.flatMap((lng) => RENAMED.map(([key]) => [lng, key])))(
    'rewords %s.%s with its own word for brand',
    (lng, key) => {
      const value = locales[lng][key];
      expect(typeof value).toBe('string');
      expect(value).not.toBe(BEFORE[key][lng as Upstream]);
      expect(value).toMatch(BRAND_WORD[lng as Upstream]);
    }
  );

  it.each(
    languages.flatMap((lng) => Object.keys(UNCHANGED).map((key) => [lng, key]))
  )('keeps %s.%s as it was', (lng, key) => {
    expect(locales[lng][key]).toBe(UNCHANGED[key][lng]);
  });
});
