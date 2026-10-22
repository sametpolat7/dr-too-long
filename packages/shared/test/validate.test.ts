import { describe, expect, it } from 'vitest';
import { type Point, validateOutput, validatePoint } from '../src/contracts/index.ts';
import { MAX_REFS_PER_POINT } from '../src/limits/index.ts';

const point = (sentences: number[]): Point => ({ text: 'A point.', sentences });

describe('validatePoint with 10 sentences', () => {
  it('drops a point whose references [0, 99] are out of range', () => {
    expect(validatePoint(point([0, 99]), 10)).toBeNull();
  });

  it('dedupes and sorts [3, 1, 1] into [1, 3]', () => {
    expect(validatePoint(point([3, 1, 1]), 10)?.sentences).toEqual([1, 3]);
  });

  it('drops non-integer references', () => {
    expect(validatePoint(point([2.5, 4]), 10)?.sentences).toEqual([4]);
  });

  it(`caps references at ${MAX_REFS_PER_POINT}`, () => {
    expect(validatePoint(point([1, 2, 3, 4, 5, 6, 7, 8]), 10)?.sentences).toHaveLength(
      MAX_REFS_PER_POINT,
    );
  });

  it('drops a point with blank text', () => {
    expect(validatePoint({ text: '  ', sentences: [1] }, 10)).toBeNull();
  });
});

describe('validateOutput with 10 sentences', () => {
  it('truncates seven list points to five and reports two dropped', () => {
    const output = { points: Array.from({ length: 7 }, (_, i) => point([i + 1])) };
    expect(validateOutput('bulleted-list', output, 10)).toMatchObject({
      dropped: 2,
      status: 'ok',
    });
    expect(validateOutput('bulleted-list', output, 10).points).toHaveLength(5);
  });

  it('flags a summary below its minimum', () => {
    const output = { points: [point([1]), point([42])] };
    expect(validateOutput('summary', output, 10)).toMatchObject({
      dropped: 1,
      status: 'below_minimum',
    });
  });

  it('returns status empty when no point is anchored', () => {
    const output = { points: [point([0]), point([11])] };
    expect(validateOutput('summary', output, 10)).toEqual({
      points: [],
      dropped: 2,
      status: 'empty',
    });
  });
});
