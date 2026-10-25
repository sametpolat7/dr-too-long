import { PROMPT_VERSION, type PromptBuilder } from '@dr-too-long/shared/contracts';
import { APICallError } from 'ai';
import type { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { RUBRIC_VERSION } from '../src/judge.ts';
import type { Candidate, EvalModel } from '../src/models.ts';
import { type RunOptions, runEvals } from '../src/run.ts';
import { corpusItem } from './fixtures.ts';
import { failingModel, textModel } from './mock-model.ts';

const first = corpusItem('en-01', 'Rivers carve valleys. Valleys collect towns.');
const second = corpusItem('en-02', 'Towns grow. Cities follow.');

const SUMMARY =
  '{"points":[{"text":"Rivers shape towns.","sentences":[1,2]},{"text":"Lost.","sentences":[9]}]}';
const VERDICT = JSON.stringify({
  verdicts: [
    {
      label: 'A',
      faithfulness: 5,
      citations: 5,
      coverage: 4,
      language: 5,
      form: 3,
      reason: 'Fine.',
    },
  ],
  ranking: ['A'],
});
const TWO_VERDICTS = JSON.stringify({
  verdicts: [
    {
      label: 'A',
      faithfulness: 5,
      citations: 5,
      coverage: 5,
      language: 5,
      form: 5,
      reason: 'Best.',
    },
    {
      label: 'B',
      faithfulness: 3,
      citations: 3,
      coverage: 3,
      language: 3,
      form: 3,
      reason: 'Weak.',
    },
  ],
  ranking: ['A', 'B'],
});

function evalModel(id: string, keyVariable: string, model: MockLanguageModelV4): EvalModel {
  return { id, keyVariable, pricing: { input: 1, output: 2 }, setup: () => ({ model }) };
}

function candidate(
  id: string,
  keyVariable: string,
  model: MockLanguageModelV4,
  prompt?: PromptBuilder,
): Candidate {
  return { id, model: evalModel(id, keyVariable, model), prompt };
}

function unauthorized(): APICallError {
  return new APICallError({ message: 'failed', url: '', requestBodyValues: {}, statusCode: 401 });
}

function options(overrides: Partial<RunOptions>): RunOptions & { lines: string[] } {
  const lines: string[] = [];
  return {
    corpus: [first],
    candidates: [candidate('a', 'A_KEY', textModel(SUMMARY))],
    presets: ['summary'],
    judge: evalModel('j', 'J_KEY', textModel(VERDICT)),
    env: { A_KEY: 'a', J_KEY: 'j' },
    log: (line) => lines.push(line),
    lines,
    ...overrides,
  };
}

describe('runEvals', () => {
  it('summarizes every item and preset, judges done outcomes and prices both', async () => {
    const run = await runEvals(options({ presets: ['summary', 'single-sentence'] }));

    expect(run).toMatchObject({
      promptVersion: PROMPT_VERSION,
      judge: { id: 'j', rubricVersion: RUBRIC_VERSION },
    });
    expect(run.results).toHaveLength(2);
    expect(run.results[0]).toEqual({
      item: 'en-01',
      preset: 'summary',
      outputLanguage: 'en',
      candidate: 'a',
      outcome: {
        type: 'done',
        points: [{ text: 'Rivers shape towns.', sentences: [1, 2] }],
        dropped: 1,
        usage: { inputTokens: 100, outputTokens: 20 },
        costUsd: 0.00014,
        latencyMs: expect.any(Number),
      },
      verdict: {
        label: 'A',
        scores: { faithfulness: 5, citations: 5, coverage: 4, language: 5, form: 3 },
        reason: 'Fine.',
        rank: 1,
        costUsd: 0.00014,
      },
    });
    expect(run.results[1]).toMatchObject({ preset: 'single-sentence', verdict: { rank: 1 } });
  });

  it('logs one line per summary and one per judged text', async () => {
    const opts = options({});
    await runEvals(opts);
    expect(opts.lines).toEqual([
      expect.stringMatching(/^a {2}en-01 {2}summary {2}done in \d+ ms for \$0\.00014$/),
      'j as judge  en-01  summary  1. a',
    ]);
  });

  it('judges the candidates of a text together and shares the cost', async () => {
    const run = await runEvals(
      options({
        candidates: [
          candidate('a', 'A_KEY', textModel(SUMMARY)),
          candidate('b', 'B_KEY', textModel(SUMMARY)),
        ],
        judge: evalModel('j', 'J_KEY', textModel(TWO_VERDICTS)),
        env: { A_KEY: 'a', B_KEY: 'b', J_KEY: 'j' },
      }),
    );

    const ranks = run.results.map((result) => result.verdict?.rank).sort();
    expect(ranks).toEqual([1, 2]);
    for (const result of run.results) expect(result.verdict?.costUsd).toBeCloseTo(0.00007, 10);
  });

  it("summarizes with the candidate's prompt", async () => {
    const model = textModel(SUMMARY);
    const custom = () => ({ system: 'Custom system.', prompt: 'Custom input.' });
    await runEvals(options({ candidates: [candidate('a', 'A_KEY', model, custom)], judge: null }));
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain('Custom system.');
  });

  it('uses the output language given over the text language', async () => {
    const run = await runEvals(options({ outputLanguage: 'tr', judge: null }));
    expect(run.results[0]).toMatchObject({ outputLanguage: 'tr' });
    expect(run.results[0]?.verdict).toBeUndefined();
    expect(run.judge).toBeNull();
  });

  it('skips a candidate without a key and refuses to run with none', async () => {
    const opts = options({
      candidates: [candidate('a', 'MISSING', textModel(SUMMARY))],
      judge: null,
    });
    await expect(runEvals(opts)).rejects.toThrow('No candidate has an API key');
    expect(opts.lines).toEqual(['a: skipped, MISSING is not set']);
  });

  it('requires the judge key', async () => {
    await expect(runEvals(options({ env: { A_KEY: 'a' } }))).rejects.toThrow('j: J_KEY is not set');
  });

  it('keeps the summaries when the judge fails and never prints the provider message', async () => {
    const opts = options({ judge: evalModel('j', 'J_KEY', failingModel(unauthorized())) });
    const run = await runEvals(opts);

    expect(run.results[0]).toMatchObject({ outcome: { type: 'done' } });
    expect(run.results[0]?.verdict).toBeUndefined();
    expect(opts.lines[1]).toBe('j as judge  en-01  summary  HTTP 401');
  });

  it('records an error without a verdict and stops the candidate after a fatal one', async () => {
    const opts = options({
      corpus: [first, second],
      candidates: [candidate('a', 'A_KEY', failingModel(unauthorized()))],
    });
    const run = await runEvals(opts);

    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toMatchObject({
      outcome: { type: 'error', code: 'unauthorized', message: 'HTTP 401' },
    });
    expect(run.results[0]?.verdict).toBeUndefined();
    expect(opts.lines).toEqual([
      expect.stringMatching(/^a {2}en-01 {2}summary {2}error unauthorized$/),
      'a: stopped after unauthorized',
    ]);
  });

  it('runs candidates that share a key one after another', async () => {
    const run = await runEvals(
      options({
        candidates: [
          candidate('a', 'A_KEY', textModel(SUMMARY)),
          candidate('b', 'B_KEY', textModel(SUMMARY)),
          candidate('c', 'A_KEY', textModel(SUMMARY)),
        ],
        judge: null,
        env: { A_KEY: 'a', B_KEY: 'b' },
      }),
    );
    expect(run.results.map((result) => result.candidate)).toEqual(['a', 'c', 'b']);
  });
});
