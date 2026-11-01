import {
  PROMPT_VERSION,
  type PresetId,
  type SummarizeRequest,
  type Summarizer,
  type SummaryEvent,
} from '@dr-too-long/shared/contracts';
import { createSummarizer } from '@dr-too-long/shared/model';
import { APICallError } from 'ai';
import { type CorpusItem, requestFor } from './corpus.ts';
import { createJudge, type Judge, RUBRIC_VERSION } from './judge.ts';
import { type Candidate, costUsd, type EvalModel, type Pricing } from './models.ts';
import { groupKey, type Outcome, type Run, type RunResult } from './results.ts';

export interface RunOptions {
  corpus: CorpusItem[];
  candidates: readonly Candidate[];
  presets: readonly PresetId[];
  outputLanguage?: string;
  judge: EvalModel | null;
  env: Record<string, string | undefined>;
  log(line: string): void;
}

interface Keyed {
  candidate: Candidate;
  apiKey: string;
}

interface Judging {
  model: EvalModel;
  judge: Judge;
}

// After one of these, every further request on the same key fails the same way.
const FATAL: ReadonlySet<string> = new Set(['unauthorized', 'quota_exceeded']);

export async function runEvals(options: RunOptions): Promise<Run> {
  const { env, log } = options;
  const keyed = options.candidates.flatMap((candidate): Keyed[] => {
    const apiKey = env[candidate.model.keyVariable];
    if (apiKey) return [{ candidate, apiKey }];
    log(`${candidate.id}: skipped, ${candidate.model.keyVariable} is not set`);
    return [];
  });
  if (keyed.length === 0) throw new Error('No candidate has an API key in the environment');

  const judging = options.judge && {
    model: options.judge,
    judge: createJudge(options.judge.setup(requireKey(options.judge, env))),
  };
  const startedAt = new Date().toISOString();
  const groups = Map.groupBy(keyed, ({ candidate }) => candidate.model.keyVariable).values();
  const results = (await Promise.all([...groups].map((group) => runGroup(group, options)))).flat();
  if (judging) await judgeAll(results, judging, options);
  return {
    startedAt,
    promptVersion: PROMPT_VERSION,
    judge: judging && { id: judging.model.id, rubricVersion: RUBRIC_VERSION },
    results,
  };
}

function requireKey({ id, keyVariable }: EvalModel, env: RunOptions['env']): string {
  const apiKey = env[keyVariable];
  if (!apiKey) throw new Error(`${id}: ${keyVariable} is not set`);
  return apiKey;
}

async function runGroup(group: Keyed[], options: RunOptions): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const { candidate, apiKey } of group) {
    results.push(...(await runCandidate(candidate, apiKey, options)));
  }
  return results;
}

async function runCandidate(
  { id, model, prompt }: Candidate,
  apiKey: string,
  { corpus, presets, outputLanguage, log }: RunOptions,
): Promise<RunResult[]> {
  const summarizer = createSummarizer(model.setup(apiKey), prompt);
  const signal = new AbortController().signal;
  const results: RunResult[] = [];
  for (const item of corpus) {
    for (const preset of presets) {
      const request = requestFor(item, preset, outputLanguage ?? item.language);
      const outcome = await summarize(summarizer, request, signal, model.pricing);
      const result = {
        item: item.id,
        preset,
        outputLanguage: request.outputLanguage,
        candidate: id,
        outcome,
      };
      results.push(result);
      log(describe(result));
      if (outcome.type === 'error' && FATAL.has(outcome.code)) {
        log(`${id}: stopped after ${outcome.code}`);
        return results;
      }
    }
  }
  return results;
}

async function summarize(
  summarizer: Summarizer,
  request: SummarizeRequest,
  signal: AbortSignal,
  pricing: Pricing,
): Promise<Outcome> {
  const started = performance.now();
  let last: SummaryEvent | undefined;
  for await (const event of summarizer.summarize(request, { signal })) last = event;
  const latencyMs = Math.round(performance.now() - started);
  if (last?.type === 'done') {
    const { output, dropped, usage } = last;
    return {
      type: 'done',
      points: output.points,
      dropped,
      usage,
      costUsd: usage && costUsd(usage, pricing),
      latencyMs,
    };
  }
  if (last?.type === 'error') {
    return { type: 'error', code: last.code, message: last.message, latencyMs };
  }
  throw new Error('The summarizer ended without a final event');
}

// A judge failure costs that call's verdicts, never the run.
async function judgeAll(
  results: RunResult[],
  { model, judge }: Judging,
  { corpus, log }: RunOptions,
): Promise<void> {
  const groups = Map.groupBy(results, groupKey);
  for (const group of groups.values()) {
    const done = group.flatMap((result) =>
      result.outcome.type === 'done' ? [{ result, points: result.outcome.points }] : [],
    );
    const [first] = done;
    if (!first) continue;
    const item = corpus.find((candidate) => candidate.id === first.result.item);
    if (!item) throw new Error(`${first.result.item} is not in the corpus`);
    const request = requestFor(item, first.result.preset, first.result.outputLanguage);
    const heading = `${model.id} as judge  ${item.id}  ${request.preset}`;
    try {
      const { verdicts, usage } = await judge(
        request,
        done.map(({ points }) => points),
      );
      const share = usage && costUsd(usage, model.pricing) / done.length;
      for (const [index, { result }] of done.entries()) {
        const verdict = verdicts[index];
        if (verdict) result.verdict = { ...verdict, costUsd: share };
      }
      log(`${heading}  ${ranking(done.map(({ result }) => result))}`);
    } catch (error) {
      log(`${heading}  ${failure(error)}`);
    }
  }
}

function ranking(results: RunResult[]): string {
  return results
    .filter((result) => result.verdict)
    .sort((a, b) => (a.verdict?.rank ?? 0) - (b.verdict?.rank ?? 0))
    .map((result) => `${result.verdict?.rank}. ${result.candidate}`)
    .join('  ');
}

// Never the provider's message: an OpenAI 401 body echoes part of the key.
function failure(error: unknown): string {
  if (APICallError.isInstance(error)) {
    return error.statusCode === undefined ? 'no response' : `HTTP ${error.statusCode}`;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

function describe({ candidate, item, preset, outcome }: RunResult): string {
  const status =
    outcome.type === 'done'
      ? `done in ${outcome.latencyMs} ms${outcome.costUsd === undefined ? '' : ` for $${outcome.costUsd.toFixed(5)}`}`
      : `error ${outcome.code}`;
  return `${candidate}  ${item}  ${preset}  ${status}`;
}
