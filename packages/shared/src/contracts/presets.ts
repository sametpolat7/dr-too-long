export const PRESET_IDS = ['single-sentence', 'summary', 'bulleted-list'] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export interface PointCount {
  min: number;
  max: number;
}

export const PRESET_RULES: Record<PresetId, PointCount> = {
  'single-sentence': { min: 1, max: 1 },
  summary: { min: 2, max: 4 },
  'bulleted-list': { min: 3, max: 5 },
};

export const DEFAULT_PRESET: PresetId = 'summary';
