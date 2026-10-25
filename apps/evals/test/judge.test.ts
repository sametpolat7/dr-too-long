import type { SummarizeRequest } from '@dr-too-long/shared/contracts';
import { describe, expect, it } from 'vitest';
import { createJudge } from '../src/judge.ts';
import { textModel } from './mock-model.ts';

const request: SummarizeRequest = {
  v: 1,
  preset: 'summary',
  outputLanguage: 'en',
  sentences: ['Rivers carve valleys.', 'Valleys collect towns.'],
};
const weak = [{ text: 'Rivers.', sentences: [1] }];
const strong = [{ text: 'Rivers shape towns.', sentences: [1, 2] }];
const OUTPUT = JSON.stringify({
  verdicts: [
    {
      label: 'A',
      faithfulness: 5,
      citations: 5,
      coverage: 4,
      language: 6,
      form: 0.4,
      reason: 'Good.',
    },
    {
      label: 'B',
      faithfulness: 3,
      citations: 3,
      coverage: 2,
      language: 3,
      form: 3,
      reason: 'Thin.',
    },
  ],
  ranking: ['A', 'B'],
});

// Keys 0.9 then 0.1 put the second summary first, so it is labelled A.
function judgeWith(output: string) {
  const keys = [0.9, 0.1];
  return createJudge({ model: textModel(output) }, () => keys.shift() ?? 0);
}

describe('createJudge', () => {
  it('scores and ranks every summary in the order given, clamping the scores', async () => {
    const { verdicts, usage } = await judgeWith(OUTPUT)(request, [weak, strong]);
    expect(verdicts).toEqual([
      {
        scores: { faithfulness: 3, citations: 3, coverage: 2, language: 3, form: 3 },
        reason: 'Thin.',
        rank: 2,
        label: 'B',
      },
      {
        scores: { faithfulness: 5, citations: 5, coverage: 4, language: 5, form: 1 },
        reason: 'Good.',
        rank: 1,
        label: 'A',
      },
    ]);
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  it('shows the judge the task, the numbered text and each labelled summary', async () => {
    const keys = [0.9, 0.1];
    const model = textModel(OUTPUT);
    await createJudge({ model }, () => keys.shift() ?? 0)(request, [weak, strong]);
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('Task the summaries are graded against:\\nNumber of points: 2 to 4,');
    expect(prompt).not.toContain('You summarize text');
    expect(prompt).toContain('[2] Valleys collect towns.');
    expect(prompt).toContain(
      'A.\\n1. Rivers shape towns. (sentences 1, 2)\\n\\nB.\\n1. Rivers. (sentences 1)',
    );
  });

  it('rejects an answer that misses a summary', async () => {
    const output = JSON.stringify({
      verdicts: [
        {
          label: 'A',
          faithfulness: 5,
          citations: 5,
          coverage: 5,
          language: 5,
          form: 5,
          reason: 'Good.',
        },
      ],
      ranking: ['A'],
    });
    await expect(judgeWith(output)(request, [weak, strong])).rejects.toThrow(
      'no verdict for summary B',
    );
  });

  it('rejects an answer that is not a verdict', async () => {
    await expect(judgeWith('not json')(request, [weak])).rejects.toThrow();
  });
});
