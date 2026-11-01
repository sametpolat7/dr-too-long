import type { Point, PresetId } from '@dr-too-long/shared/contracts';

// The summary as the card shows it.
export function copyText(preset: PresetId, points: Point[]): string {
  return preset === 'bulleted-list'
    ? points.map((point) => `- ${point.text}`).join('\n')
    : points.map((point) => point.text).join(' ');
}
