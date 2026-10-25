import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rateRun } from '../src/rate.ts';
import { type RunResult, readRun, writeRun } from '../src/results.ts';
import { corpusItem, runOf } from './fixtures.ts';

const item = corpusItem('en-01', 'Rivers carve valleys. Valleys collect towns.');

function done(candidate: string, text: string, builderRating?: number): RunResult {
  return {
    item: 'en-01',
    preset: 'summary',
    outputLanguage: 'en',
    candidate,
    outcome: { type: 'done', points: [{ text, sentences: [1] }], dropped: 0, latencyMs: 10 },
    builderRating,
  };
}

const failed: RunResult = {
  ...done('c', ''),
  outcome: { type: 'error', code: 'network', message: 'TypeError', latencyMs: 5 },
};

function session(answers: string[]) {
  const printed: string[] = [];
  const terminal = {
    ask: async () => {
      const answer = answers.shift();
      if (answer === undefined) throw new Error('interrupted');
      return answer;
    },
    print: (text: string) => {
      printed.push(text);
    },
  };
  return { terminal, printed };
}

function runFile(results: RunResult[]): string {
  const path = join(mkdtempSync(join(tmpdir(), 'evals-')), 'run.json');
  writeRun(path, runOf(results));
  return path;
}

function ratings(path: string): (number | undefined)[] {
  return readRun(path).results.map((result) => result.builderRating);
}

describe('rateRun', () => {
  it('asks for a rating per summary, re-asks on bad input and skips errors', async () => {
    const path = runFile([done('a', 'Summary A.'), done('b', 'Summary B.'), failed]);
    const { terminal, printed } = session(['x', '4', '']);
    await rateRun(path, [item], terminal, () => 0.5);

    expect(printed[0]).toBe(
      '\n## Sample · summary · en\n\nRivers carve valleys. Valleys collect towns.\n',
    );
    expect(printed).toContain('\nA. Summary A.');
    expect(printed).toContain('Enter a whole number from 1 to 5.');
    expect(printed).toContain('\nB. Summary B.');
    expect(printed.join('\n')).not.toContain('C.');
    expect(ratings(path)).toEqual([4, undefined, undefined]);
  });

  it('continues with the summaries that have no rating yet', async () => {
    const path = runFile([done('a', 'Summary A.', 4), done('b', 'Summary B.')]);
    const { terminal, printed } = session(['5']);
    await rateRun(path, [item], terminal);

    expect(printed).toContain('\nA. Summary B.');
    expect(ratings(path)).toEqual([4, 5]);
  });

  it('keeps the ratings given before an interruption', async () => {
    const path = runFile([done('a', 'Summary A.'), done('b', 'Summary B.')]);
    const { terminal } = session(['3']);
    await expect(rateRun(path, [item], terminal, () => 0.5)).rejects.toThrow('interrupted');

    expect(ratings(path)).toEqual([3, undefined]);
  });

  it('shuffles the summaries of a text', async () => {
    const path = runFile([done('a', 'Summary A.'), done('b', 'Summary B.')]);
    const keys = [0.9, 0.1];
    const { terminal, printed } = session(['1', '2']);
    await rateRun(path, [item], terminal, () => keys.shift() ?? 0);

    expect(printed).toContain('\nA. Summary B.');
    expect(printed).toContain('\nB. Summary A.');
    expect(ratings(path)).toEqual([2, 1]);
  });
});
