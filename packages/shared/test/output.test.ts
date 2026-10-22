import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { summaryOutputSchema } from '../src/contracts/index.ts';

const KEYWORDS_THE_MODEL_REJECTS = [
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
];

describe('summaryOutputSchema', () => {
  const jsonSchema = z.toJSONSchema(summaryOutputSchema);

  it('produces a closed JSON Schema', () => {
    expect(jsonSchema).toMatchSnapshot();
  });

  it('carries no length or range keywords', () => {
    const serialized = JSON.stringify(jsonSchema);
    for (const keyword of KEYWORDS_THE_MODEL_REJECTS) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  });

  it('rejects extra fields on a point', () => {
    const point = { text: 'A point.', sentences: [1], note: 'extra' };
    expect(summaryOutputSchema.safeParse({ points: [point] }).success).toBe(false);
  });
});
