import { MAX_REFS_PER_POINT } from '../limits/index.ts';
import type { Point, SummaryOutput } from './output.ts';
import { PRESET_RULES, type PresetId } from './presets.ts';

export interface ValidatedOutput {
  points: Point[];
  dropped: number;
  status: 'ok' | 'below_minimum' | 'empty';
}

export function validatePoint(point: Point, sentenceCount: number): Point | null {
  const text = point.text.trim();
  const sentences = [...new Set(point.sentences)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= sentenceCount)
    .sort((a, b) => a - b)
    .slice(0, MAX_REFS_PER_POINT);

  return text && sentences.length > 0 ? { text, sentences } : null;
}

export function validateOutput(
  preset: PresetId,
  output: SummaryOutput,
  sentenceCount: number,
): ValidatedOutput {
  const { min, max } = PRESET_RULES[preset];
  const points = output.points
    .map((point) => validatePoint(point, sentenceCount))
    .filter((point) => point !== null)
    .slice(0, max);

  const status = points.length === 0 ? 'empty' : points.length < min ? 'below_minimum' : 'ok';
  return { points, dropped: output.points.length - points.length, status };
}
