import type { ErrorCode, Point, ShapeId } from '@dr-too-long/shared/contracts';

export type ErrorState = { status: 'error'; code: ErrorCode; detail?: string };

export type CardState =
  | { status: 'summarizing'; points: Point[] }
  | { status: 'done'; points: Point[] }
  | ErrorState;

export interface View {
  shape: ShapeId;
  language: string;
}

export const viewKey = ({ shape, language }: View): string => `${shape} ${language}`;
