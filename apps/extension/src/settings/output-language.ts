import { storage } from 'wxt/utils/storage';
import { isListedLanguage, type LanguageChoice, resolveLanguage } from '../languages.ts';

// Absent means Auto.
const choice = storage.defineItem<string>('local:outputLanguage');

// A tag that a later version no longer lists reads as Auto.
const listedOrAuto = (tag: string | null): LanguageChoice =>
  tag !== null && isListedLanguage(tag) ? tag : null;

export const readLanguageChoice = async (): Promise<LanguageChoice> =>
  listedOrAuto(await choice.getValue());

export const writeLanguageChoice = (tag: LanguageChoice): Promise<void> =>
  tag === null ? choice.removeValue() : choice.setValue(tag);

export async function readOutputLanguage(): Promise<string> {
  return resolveLanguage(await readLanguageChoice());
}
