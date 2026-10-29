import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  readLanguageChoice,
  readOutputLanguage,
  watchLanguageChoice,
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

  it('reads a saved tag that the list no longer has as Auto', async () => {
    await storage.setItem('local:outputLanguage', 'pt-BR');
    expect(await readLanguageChoice()).toBeNull();
    expect(await readOutputLanguage()).toBe('en-US');
  });

  it('reports each new choice, an unlisted one as Auto', async () => {
    const seen: Array<string | null> = [];
    const unwatch = watchLanguageChoice((tag) => seen.push(tag));
    await writeLanguageChoice('tr');
    await storage.setItem('local:outputLanguage', 'pt-BR');
    await vi.waitFor(() => expect(seen).toEqual(['tr', null]));
    unwatch();
  });

  it('goes back to Auto when the choice is cleared', async () => {
    await writeLanguageChoice('tr');
    await writeLanguageChoice(null);
    expect(await readLanguageChoice()).toBeNull();
    expect(await readOutputLanguage()).toBe('en-US');
  });
});
