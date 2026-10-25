export const PRESET_IDS = ['single-sentence', 'summary', 'bulleted-list'] as const;

export type PresetId = (typeof PRESET_IDS)[number];

// Points per summary and words per point.
export interface PresetRule {
  min: number;
  max: number;
  words: number;
}

export const PRESET_RULES: Record<PresetId, PresetRule> = {
  'single-sentence': { min: 1, max: 1, words: 30 },
  summary: { min: 2, max: 4, words: 25 },
  'bulleted-list': { min: 3, max: 5, words: 18 },
};

export const DEFAULT_PRESET: PresetId = 'summary';
