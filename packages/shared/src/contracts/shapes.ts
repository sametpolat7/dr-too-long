export const SHAPE_IDS = ['summary', 'key-points'] as const;

export type ShapeId = (typeof SHAPE_IDS)[number];

export const DEFAULT_SHAPE: ShapeId = 'summary';

export const isShapeId = (value: string): value is ShapeId =>
  (SHAPE_IDS as readonly string[]).includes(value);
