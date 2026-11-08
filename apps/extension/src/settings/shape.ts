import { DEFAULT_SHAPE, isShapeId, type ShapeId } from '@dr-too-long/shared/contracts';
import { storage } from 'wxt/utils/storage';

// Absent means the default shape; a shape a later version no longer has reads as the default.
const shape = storage.defineItem<string>('local:shape');

export async function readShape(): Promise<ShapeId> {
  const saved = await shape.getValue();
  return saved !== null && isShapeId(saved) ? saved : DEFAULT_SHAPE;
}

export const writeShape = (id: ShapeId): Promise<void> => shape.setValue(id);
