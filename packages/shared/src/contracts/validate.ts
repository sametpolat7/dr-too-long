import type { Point, SummaryOutput } from './output.ts';

function validatePoint(point: Point, sentenceCount: number): Point | null {
  const text = point.text.trim();
  const sentences = [...new Set(point.sentences)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= sentenceCount)
    .sort((a, b) => a - b);

  return text && sentences.length > 0 ? { text, sentences } : null;
}

export function validateOutput(output: SummaryOutput, sentenceCount: number): Point[] {
  return output.points
    .map((point) => validatePoint(point, sentenceCount))
    .filter((point) => point !== null);
}
