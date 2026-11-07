import { describe, expect, it } from 'vitest';
import { type Point, validateOutput } from '../src/contracts/index.ts';

const point = (sentences: number[]): Point => ({ text: 'A point.', sentences });
const validate = (...points: Point[]) => validateOutput({ points }, 10);

describe('validateOutput with 10 sentences', () => {
  it('keeps every anchored point, seven of seven', () => {
    const points = Array.from({ length: 7 }, (_, i) => point([i + 1]));
    expect(validate(...points)).toEqual(points);
  });

  it('drops a point whose references [0, 99] are out of range', () => {
    expect(validate(point([1]), point([0, 99]))).toEqual([point([1])]);
  });

  it('dedupes and sorts [3, 1, 1] into [1, 3]', () => {
    expect(validate(point([3, 1, 1]))).toEqual([point([1, 3])]);
  });

  it('drops non-integer references', () => {
    expect(validate(point([2.5, 4]))).toEqual([point([4])]);
  });

  it('keeps all eight valid references', () => {
    expect(validate(point([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([point([1, 2, 3, 4, 5, 6, 7, 8])]);
  });

  it('trims the text and drops a point with blank text', () => {
    expect(validate({ text: ' Kept. ', sentences: [1] }, { text: '  ', sentences: [2] })).toEqual([
      { text: 'Kept.', sentences: [1] },
    ]);
  });

  it('keeps no point when none is anchored', () => {
    expect(validate(point([0]), point([11]))).toEqual([]);
  });
});
