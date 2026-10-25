import { type CorpusItem, parseItem } from '../src/corpus.ts';
import type { Run, RunResult } from '../src/results.ts';

const HEADER = [
  'title: Sample',
  'language: en',
  'genre: test',
  'source: https://example.com/sample',
  'license: CC0',
].join('\n');

export function corpusFile(text: string, header = HEADER): string {
  return `---\n${header}\n---\n${text}\n`;
}

export function corpusItem(id: string, text: string): CorpusItem {
  return parseItem(id, corpusFile(text));
}

export function runOf(results: RunResult[], judge: Run['judge'] = null): Run {
  return { startedAt: '2026-10-25T10:00:00.000Z', promptVersion: 1, judge, results };
}
