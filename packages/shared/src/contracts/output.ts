import { z } from 'zod';

// No integer, length or range rules: the JSON Schema sent to the model must not carry
// them. validatePoint enforces them instead.
const pointSchema = z.strictObject({
  text: z.string(),
  sentences: z.array(z.number()),
});

export const summaryOutputSchema = z.strictObject({
  points: z.array(pointSchema),
});

export type Point = z.infer<typeof pointSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;
