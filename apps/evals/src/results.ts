import { readFileSync, writeFileSync } from 'node:fs';
import { PRESET_IDS, summaryOutputSchema } from '@dr-too-long/shared/contracts';
import { z } from 'zod';
import { scoresSchema } from './judge.ts';

const usageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number() });

const judgeSchema = z.object({ id: z.string(), rubricVersion: z.number() });

const outcomeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('done'),
    points: summaryOutputSchema.shape.points,
    dropped: z.number(),
    usage: usageSchema.optional(),
    costUsd: z.number().optional(),
    latencyMs: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    latencyMs: z.number(),
  }),
]);

const verdictSchema = z.object({
  label: z.string(),
  scores: scoresSchema,
  reason: z.string(),
  rank: z.number(),
  costUsd: z.number().optional(),
});

const resultSchema = z.object({
  item: z.string(),
  preset: z.enum(PRESET_IDS),
  outputLanguage: z.string(),
  candidate: z.string(),
  outcome: outcomeSchema,
  verdict: verdictSchema.optional(),
  builderRating: z.number().optional(),
});

const runSchema = z.object({
  startedAt: z.string(),
  promptVersion: z.number(),
  judge: judgeSchema.nullable(),
  results: z.array(resultSchema),
});

export type Outcome = z.infer<typeof outcomeSchema>;
export type RunResult = z.infer<typeof resultSchema>;
export type Run = z.infer<typeof runSchema>;

export function readRun(path: string): Run {
  const parsed = runSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`${path}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function writeRun(path: string, run: Run): void {
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
}

// Every candidate's summary of one text, preset and output language shares a key.
export function groupKey({ item, preset, outputLanguage }: RunResult): string {
  return [item, preset, outputLanguage].join(' ');
}
