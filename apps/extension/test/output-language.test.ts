import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  readLanguageChoice,
  readOutputLanguage,
  writeLanguageChoice,
} from '../src/settings/output-language.ts';

describe('output language setting', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });

  it("follows Chrome's UI language until a language is chosen", async () => {
    expect(await readLanguageChoice()).toBeNull();
    expect(await readOutputLanguage()).toBe('en-US');
  });

  it('uses the chosen language', async () => {
    await writeLanguageChoice('tr');
    expect(await readLanguageChoice()).toBe('tr');
    expect(await readOutputLanguage()).toBe('tr');
  });

  it('goes back to Auto when the choice is cleared', async () => {
    await writeLanguageChoice('tr');
    await writeLanguageChoice(null);
    expect(await readLanguageChoice()).toBeNull();
    expect(await readOutputLanguage()).toBe('en-US');
  });
});
