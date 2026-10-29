// The locales the Chrome Web Store supports for localizing extensions, from the chrome.i18n
// reference, as BCP 47 tags.
const LOCALES = [
  'am',
  'ar',
  'bg',
  'bn',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'en-AU',
  'en-GB',
  'en-US',
  'es',
  'es-419',
  'et',
  'fa',
  'fi',
  'fil',
  'fr',
  'gu',
  'he',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'kn',
  'ko',
  'lt',
  'lv',
  'ml',
  'mr',
  'ms',
  'nl',
  'no',
  'pl',
  'pt-BR',
  'pt-PT',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sv',
  'sw',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'vi',
  'zh-CN',
  'zh-TW',
];

// English name first, for an English page, then the language's own name where it differs. Standard
// names put a region after its language, so Portuguese (Brazil) sorts beside Portuguese.
export function languageLabel(tag: string): string {
  const options = { type: 'language', languageDisplay: 'standard' } as const;
  const english = new Intl.DisplayNames(['en'], options).of(tag) ?? tag;
  const own = new Intl.DisplayNames([tag], options).of(tag) ?? tag;
  return own === english ? english : `${english} — ${own}`;
}

export const LANGUAGES = LOCALES.map((tag) => ({ tag, label: languageLabel(tag) })).sort((a, b) =>
  a.label.localeCompare(b.label, 'en'),
);
