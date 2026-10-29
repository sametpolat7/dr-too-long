import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../src/options/languages.ts';

describe('LANGUAGES', () => {
  it('offers each language once, with no regional variant', () => {
    const locales = LANGUAGES.map((language) => new Intl.Locale(language.tag));
    expect(locales.filter((locale) => locale.region !== undefined)).toEqual([]);
    const others = locales.map((locale) => locale.language).filter((language) => language !== 'zh');
    expect(new Set(others).size).toBe(others.length);
  });

  it('offers Chinese by script without naming a place', () => {
    expect(LANGUAGES.filter((language) => language.tag.startsWith('zh'))).toEqual([
      { tag: 'zh-Hans', label: 'Chinese (Simplified) — 中文（简体）' },
      { tag: 'zh-Hant', label: 'Chinese (Traditional) — 中文（繁體）' },
    ]);
  });

  it('labels a language by its English name, then its own', () => {
    expect(LANGUAGES.find((language) => language.tag === 'tr')?.label).toBe('Turkish — Türkçe');
  });
});
