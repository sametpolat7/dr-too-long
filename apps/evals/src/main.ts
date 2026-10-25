import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PRESET_IDS } from '@dr-too-long/shared/contracts';
import { LANGUAGES, loadCorpus } from './corpus.ts';
import { CANDIDATES, type Candidate, JUDGE } from './models.ts';
import { rateRun } from './rate.ts';
import { renderReport } from './report.ts';
import { readRun, writeRun } from './results.ts';
import { runEvals } from './run.ts';

const RESULTS_DIR = new URL('../results/', import.meta.url);

const USAGE = `Usage:
  evals run [--candidate <id>]... [--preset <id>]... [--language en|tr] [--output-language <tag>] [--limit <n>] [--no-judge]
  evals rate <run.json>
  evals report <run.json>

Candidates: ${CANDIDATES.map((candidate) => candidate.id).join(', ')}
Presets: ${PRESET_IDS.join(', ')}`;

const {
  positionals: [command, file],
  values,
} = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    candidate: { type: 'string', multiple: true },
    preset: { type: 'string', multiple: true },
    language: { type: 'string' },
    'output-language': { type: 'string' },
    limit: { type: 'string' },
    judge: { type: 'boolean', default: true },
  },
});

try {
  switch (command) {
    case 'run':
      await run();
      break;
    case 'rate':
      await rate(runFile(file));
      break;
    case 'report':
      report(runFile(file));
      break;
    default:
      throw new Error(USAGE);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function run(): Promise<void> {
  const language =
    values.language === undefined ? undefined : oneOf(LANGUAGES, values.language, 'language');
  const limit = values.limit === undefined ? undefined : positiveInteger(values.limit);
  const corpus = loadCorpus()
    .filter((item) => language === undefined || item.language === language)
    .slice(0, limit);
  const result = await runEvals({
    corpus,
    candidates: values.candidate?.map((id) => candidate(id)) ?? CANDIDATES,
    presets: values.preset?.map((id) => oneOf(PRESET_IDS, id, 'preset')) ?? PRESET_IDS,
    outputLanguage: values['output-language'],
    judge: values.judge ? JUDGE : null,
    env: process.env,
    log: (line) => console.error(line),
  });

  mkdirSync(RESULTS_DIR, { recursive: true });
  const name = result.startedAt.replaceAll(/[:.]/g, '-');
  const path = fileURLToPath(new URL(`${name}.json`, RESULTS_DIR));
  writeRun(path, result);
  report(path);
  console.error(`Saved ${path}`);
}

async function rate(path: string): Promise<void> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rateRun(path, loadCorpus(), {
      ask: (question) => readline.question(question),
      print: (text) => console.log(text),
    });
  } finally {
    readline.close();
  }
  report(path);
}

function report(path: string): void {
  const text = renderReport(readRun(path));
  writeFileSync(path.replace(/\.json$/, '.md'), text);
  console.log(text);
}

function runFile(value: string | undefined): string {
  if (value === undefined || !value.endsWith('.json')) throw new Error(USAGE);
  return value;
}

function candidate(id: string): Candidate {
  const found = CANDIDATES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown candidate: ${id}`);
  return found;
}

function oneOf<T extends string>(allowed: readonly T[], value: string, what: string): T {
  const found = allowed.find((option) => option === value);
  if (found === undefined) throw new Error(`Unknown ${what}: ${value}`);
  return found;
}

function positiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return number;
}
