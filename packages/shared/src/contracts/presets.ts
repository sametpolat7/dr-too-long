export const PRESET_IDS = ['summary', 'key-points'] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export const DEFAULT_PRESET: PresetId = 'summary';
