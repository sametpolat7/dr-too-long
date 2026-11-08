import type { Point, ShapeId } from '@dr-too-long/shared/contracts';

// A full-width sentence mark, as Chinese and Japanese use, carries its own spacing, so no space
// follows it, even after a closing bracket or quote.
const FULL_WIDTH_END = /[\u3002\uFF01\uFF1F\uFF0E][\p{Pe}\p{Pf}]*$/u;

// What goes between a point of the Summary shape and the next.
export const separatorAfter = (text: string): string => (FULL_WIDTH_END.test(text) ? '' : ' ');

// The summary as the card shows it.
export function copyText(shape: ShapeId, points: Point[]): string {
  if (shape === 'key-points') return points.map((point) => `- ${point.text}`).join('\n');
  return points.reduce(
    (text, point) => (text === '' ? point.text : `${text}${separatorAfter(text)}${point.text}`),
    '',
  );
}
