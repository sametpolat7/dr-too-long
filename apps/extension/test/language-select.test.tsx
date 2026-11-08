import { render } from 'preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { LanguageSelect } from '../src/LanguageSelect.tsx';

function options(): HTMLOptionElement[] {
  const container = document.createElement('div');
  render(<LanguageSelect choice={null} onChange={() => undefined} />, container);
  return [...container.querySelectorAll('option')];
}

const labelOf = (tag: string) => options().find((option) => option.value === tag)?.text;

describe('LanguageSelect', () => {
  beforeEach(() => {
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });

  it("offers Auto, named after Chrome's language, before every listed language", () => {
    const [auto, ...languages] = options();
    expect(auto?.value).toBe('');
    expect(auto?.text).toBe("Auto: Chrome's language (English (United States))");
    expect(languages).toHaveLength(47);
  });

  it('labels a language by its English name, then its own', () => {
    expect(labelOf('tr')).toBe('Turkish — Türkçe');
    expect(labelOf('en')).toBe('English');
  });

  it('offers Chinese by script without naming a place, side by side', () => {
    const texts = options().map((option) => option.text);
    const simplified = texts.indexOf('Chinese (Simplified) — 中文（简体）');
    expect(simplified).toBeGreaterThan(0);
    expect(texts[simplified + 1]).toBe('Chinese (Traditional) — 中文（繁體）');
  });
});
