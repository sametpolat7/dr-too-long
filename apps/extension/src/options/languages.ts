// The languages of the locale list in the chrome.i18n reference, as BCP 47 tags: one entry per
// language rather than per region, Chinese by script rather than by place, and no Catalan. Thai and
// Amharic are left out because the sentence segmenter cannot split much of their prose.
const TAGS = [
  'ar',
  'bg',
  'bn',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
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
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sv',
  'sw',
  'ta',
  'te',
  'tr',
  'uk',
  'vi',
  'zh-Hans',
  'zh-Hant',
];

// English name first, for an English page, then the language's own name where it differs. Standard
// names put a qualifier after the language, so Chinese (Simplified) sorts beside Chinese
// (Traditional).
export function languageLabel(tag: string): string {
  const options = { type: 'language', languageDisplay: 'standard' } as const;
  const english = new Intl.DisplayNames(['en'], options).of(tag) ?? tag;
  const own = new Intl.DisplayNames([tag], options).of(tag) ?? tag;
  return own === english ? english : `${english} — ${own}`;
}

export const LANGUAGES = TAGS.map((tag) => ({ tag, label: languageLabel(tag) })).sort((a, b) =>
  a.label.localeCompare(b.label, 'en'),
);
