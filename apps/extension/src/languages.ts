import { browser } from 'wxt/browser';

// A listed language's tag, or null for Auto, which follows Chrome's UI language.
export type LanguageChoice = string | null;

// The languages of the locale list in the chrome.i18n reference, as BCP 47 tags: one entry per
// language rather than per region, Chinese by script rather than by place, and no Catalan. Thai and
// Amharic are left out because the sentence segmenter cannot split much of their prose.
export const LANGUAGE_TAGS = [
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

export const isListedLanguage = (tag: string): boolean => LANGUAGE_TAGS.includes(tag);

export function resolveLanguage(choice: LanguageChoice): string {
  return choice ?? browser.i18n.getUILanguage();
}

interface TextInfo {
  direction?: string;
}

// Chrome 99 added a textInfo getter and Chrome 130 the standard getTextInfo(); TypeScript's ES2023
// library types neither.
export function textDirection(tag: string): 'ltr' | 'rtl' {
  const locale = new Intl.Locale(tag) as Intl.Locale & {
    getTextInfo?: () => TextInfo;
    textInfo?: TextInfo;
  };
  return (locale.getTextInfo?.() ?? locale.textInfo)?.direction === 'rtl' ? 'rtl' : 'ltr';
}
