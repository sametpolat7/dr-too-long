import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

// The reader's choice; absent means Auto, which follows Chrome's UI language.
const choice = storage.defineItem<string>('local:outputLanguage');

export const readLanguageChoice = (): Promise<string | null> => choice.getValue();

export const writeLanguageChoice = (tag: string | null): Promise<void> =>
  tag === null ? choice.removeValue() : choice.setValue(tag);

export async function readOutputLanguage(): Promise<string> {
  return (await readLanguageChoice()) ?? browser.i18n.getUILanguage();
}
