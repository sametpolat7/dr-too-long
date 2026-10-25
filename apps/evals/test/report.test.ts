import { describe, expect, it } from 'vitest';
import type { Scores } from '../src/judge.ts';
import { renderReport } from '../src/report.ts';
import type { RunResult } from '../src/results.ts';
import { runOf } from './fixtures.ts';

interface Done {
  latencyMs: number;
  costUsd: number;
  dropped: number;
  scores?: Scores;
  rank?: number;
  rating?: number;
}

function done(candidate: string, preset: RunResult['preset'], fields: Done): RunResult {
  const { latencyMs, costUsd, dropped, scores, rank, rating } = fields;
  return {
    item: 'en-01',
    preset,
    outputLanguage: 'en',
    candidate,
    outcome: {
      type: 'done',
      points: [{ text: 'Point.', sentences: [1] }],
      dropped,
      latencyMs,
      costUsd,
    },
    verdict: scores && { label: 'A', scores, reason: 'Because.', rank: rank ?? 1, costUsd: 0.0001 },
    builderRating: rating,
  };
}

function failed(candidate: string, preset: RunResult['preset'], latencyMs: number): RunResult {
  return {
    item: 'en-01',
    preset,
    outputLanguage: 'en',
    candidate,
    outcome: { type: 'error', code: 'network', message: 'TypeError', latencyMs },
  };
}

const run = runOf(
  [
    done('a', 'summary', {
      latencyMs: 100,
      costUsd: 0.0001,
      dropped: 1,
      scores: { faithfulness: 5, citations: 5, coverage: 4, language: 5, form: 4 },
      rating: 4,
    }),
    done('a', 'summary', {
      latencyMs: 300,
      costUsd: 0.0003,
      dropped: 0,
      scores: { faithfulness: 3, citations: 3, coverage: 4, language: 3, form: 4 },
      rank: 2,
    }),
    failed('a', 'summary', 50),
    done('b', 'summary', {
      latencyMs: 200,
      costUsd: 0.0002,
      dropped: 0,
      scores: { faithfulness: 5, citations: 5, coverage: 5, language: 5, form: 5 },
      rating: 5,
    }),
    done('a', 'bulleted-list', { latencyMs: 120, costUsd: 0.0002, dropped: 0 }),
  ],
  { id: 'j', rubricVersion: 2 },
);

function compact(text: string): string {
  return text.replaceAll(/ +/g, ' ');
}

describe('renderReport', () => {
  const report = compact(renderReport(run));

  it('summarizes each candidate per preset, with latency over completed summaries', () => {
    expect(report).toContain('# Eval run 2026-10-25T10:00:00.000Z');
    expect(report).toContain('Prompt version 1. Judge: j with rubric 2. 5 summaries.');
    expect(report).toContain(
      '| Candidate | Summaries | Errors | Dropped | Faithfulness | Citations | Coverage | Language | Form | Judge | Rank | Builder | Words/pt | Spliced | p50 ms | $ per 1k |',
    );
    expect(report).toContain(
      '| a | 3 | 1 | 1 | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | 1.5 | 4.0 (1) | 1.0 | 0% | 200 | 0.20 |',
    );
    expect(report).toContain(
      '| b | 1 | 0 | 0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 1.0 | 5.0 (1) | 1.0 | 0% | 200 | 0.20 |',
    );
  });

  it('leaves a dash where nothing was measured', () => {
    expect(report).toContain('## bulleted-list');
    expect(report).toContain(
      '| a | 1 | 0 | 0 | – | – | – | – | – | – | – | – | 1.0 | 0% | 120 | 0.20 |',
    );
    expect(compact(renderReport(runOf([failed('a', 'summary', 50)])))).toContain(
      '| a | 1 | 1 | 0 | – | – | – | – | – | – | – | – | – | – | – | – |',
    );
  });

  it('lists error codes per candidate only when there are errors', () => {
    expect(report).toContain('## Errors\n\n- a: network ×1\n');
    expect(
      renderReport(runOf([done('a', 'summary', { latencyMs: 1, costUsd: 0, dropped: 0 })])),
    ).not.toContain('## Errors');
  });

  it('totals the cost per candidate and for the judge', () => {
    expect(report).toContain('- a: $0.0006 for 4 summaries');
    expect(report).toContain('- b: $0.0002 for 1 summary');
    expect(report).toContain('- j as judge: $0.0003 for 3 verdicts');
  });

  it('names no judge when none ran', () => {
    const text = renderReport(runOf([failed('a', 'summary', 50)]));
    expect(text).toContain('Judge: none.');
    expect(text).not.toContain('as judge');
  });
});
