import { storage } from 'wxt/utils/storage';

const apiKey = storage.defineItem<string>('local:apiKey');

export const readApiKey = (): Promise<string | null> => apiKey.getValue();
export const writeApiKey = (value: string): Promise<void> => apiKey.setValue(value.trim());
export const removeApiKey = (): Promise<void> => apiKey.removeValue();
