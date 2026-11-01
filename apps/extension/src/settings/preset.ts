import { DEFAULT_PRESET, isPresetId, type PresetId } from '@dr-too-long/shared/contracts';
import { storage } from 'wxt/utils/storage';

// Absent means the default shape; a shape a later version no longer has reads as the default.
const preset = storage.defineItem<string>('local:preset');

export async function readPreset(): Promise<PresetId> {
  const saved = await preset.getValue();
  return saved !== null && isPresetId(saved) ? saved : DEFAULT_PRESET;
}

export const writePreset = (id: PresetId): Promise<void> => preset.setValue(id);
