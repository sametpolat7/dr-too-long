import { storage } from 'wxt/utils/storage';
import { isListedLanguage, resolveLanguage } from '../languages.ts';

// The reader's choice; absent means Auto, which follows Chrome's UI language.
const choice = storage.defineItem<string>('local:outputLanguage');

// A tag that a later version no longer lists reads as Auto.
const listedOrAuto = (tag: string | null): string | null =>
  tag !== null && isListedLanguage(tag) ? tag : null;

export const readLanguageChoice = async (): Promise<string | null> =>
  listedOrAuto(await choice.getValue());

export const writeLanguageChoice = (tag: string | null): Promise<void> =>
  tag === null ? choice.removeValue() : choice.setValue(tag);

// Calls back with each new choice, whether the options page or a card saved it. Returns the
// function that stops watching.
export const watchLanguageChoice = (callback: (tag: string | null) => void): (() => void) =>
  choice.watch((tag) => callback(listedOrAuto(tag)));

export async function readOutputLanguage(): Promise<string> {
  return resolveLanguage(await readLanguageChoice());
}
