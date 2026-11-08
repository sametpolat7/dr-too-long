import type { Point, ShapeId } from '@dr-too-long/shared/contracts';

// The summary as the card shows it.
export function copyText(shape: ShapeId, points: Point[]): string {
  return shape === 'key-points'
    ? points.map((point) => `- ${point.text}`).join('\n')
    : points.map((point) => point.text).join(' ');
}
