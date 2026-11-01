import { PRESET_IDS } from '@dr-too-long/shared/contracts';
import { CRITERIA } from './judge.ts';
import { groupKey, type Run, type RunResult } from './results.ts';

const NONE = '–';

const HEADERS = [
  'Candidate',
  'Summaries',
  'Errors',
  'Dropped',
  ...CRITERIA.map((criterion) => criterion.charAt(0).toUpperCase() + criterion.slice(1)),
  'Judge',
  'Rank',
  'Builder',
  'Words/pt',
  'Cites/pt',
  'Spliced',
  'p50 ms',
  '$ per 1k',
];

export function renderReport(run: Run): string {
  const judge = run.judge ? `${run.judge.id} with rubric ${run.judge.rubricVersion}` : 'none';
  const lines = [
    `# Eval run ${run.startedAt}`,
    '',
    `Shipped prompt version ${run.promptVersion}. Judge: ${judge}. ${run.results.length} summaries.`,
  ];
  for (const preset of PRESET_IDS) {
    const results = run.results.filter((result) => result.preset === preset);
    if (results.length === 0) continue;
    const rows = candidatesOf(results).map((candidate) =>
      row(
        candidate,
        results.filter((result) => result.candidate === candidate),
      ),
    );
    lines.push('', `## ${preset}`, '', table(HEADERS, rows));
  }
  const errors = errorLines(run);
  if (errors.length > 0) lines.push('', '## Errors', '', ...errors);
  const agreement = agreementLine(run);
  if (agreement) lines.push('', '## Agreement', '', agreement);
  lines.push('', '## Cost', '', ...costLines(run));
  return `${lines.join('\n')}\n`;
}

function row(candidate: string, results: RunResult[]): string[] {
  const done = doneOf(results);
  const points = done.flatMap((outcome) => outcome.points);
  const verdicts = verdictsOf(results);
  const ratings = results.flatMap((result) =>
    result.builderRating === undefined ? [] : [result.builderRating],
  );
  const criteria = CRITERIA.map((criterion) =>
    mean(verdicts.map((verdict) => verdict.scores[criterion])),
  );
  return [
    candidate,
    String(results.length),
    String(results.length - done.length),
    String(sum(done.map((outcome) => outcome.dropped))),
    ...criteria.map((score) => fixed(score, 1)),
    fixed(mean(criteria), 1),
    fixed(mean(verdicts.map((verdict) => verdict.rank)), 1),
    ratings.length === 0 ? NONE : `${fixed(mean(ratings), 1)} (${ratings.length})`,
    // Density the judge's form score misses.
    fixed(mean(points.map((point) => point.text.split(/\s+/).length)), 1),
    fixed(mean(points.map((point) => point.sentences.length)), 1),
    points.length === 0
      ? NONE
      : `${Math.round((100 * points.filter((point) => point.text.includes(';')).length) / points.length)}%`,
    fixed(median(done.map((outcome) => outcome.latencyMs)), 0),
    fixed(mean(costs(done)) * 1000, 2),
  ];
}

// Two summaries of one text that the builder rated differently are a pair; it agrees when the
// judge ranks the one rated higher ahead of the other.
function agreementLine(run: Run): string | null {
  let agreed = 0;
  let total = 0;
  for (const group of Map.groupBy(run.results, groupKey).values()) {
    const rated = group.flatMap((result) =>
      result.builderRating === undefined || !result.verdict
        ? []
        : [{ rating: result.builderRating, rank: result.verdict.rank }],
    );
    for (const [index, a] of rated.entries()) {
      for (const b of rated.slice(index + 1)) {
        if (a.rating === b.rating) continue;
        total += 1;
        if (a.rating > b.rating === a.rank < b.rank) agreed += 1;
      }
    }
  }
  if (total === 0) return null;
  return `Builder and judge agree on ${agreed} of ${count(total, 'rated pair', 'rated pairs')}.`;
}

function costLines(run: Run): string[] {
  const lines = candidatesOf(run.results).map((candidate) => {
    const results = run.results.filter((result) => result.candidate === candidate);
    const total = fixed(sum(costs(doneOf(results))), 4);
    return `- ${candidate}: $${total} for ${count(results.length, 'summary', 'summaries')}`;
  });
  if (run.judge) {
    const verdicts = verdictsOf(run.results);
    const total = fixed(sum(costs(verdicts)), 4);
    lines.push(
      `- ${run.judge.id} as judge: $${total} for ${count(verdicts.length, 'verdict', 'verdicts')}`,
    );
  }
  return lines;
}

function errorLines(run: Run): string[] {
  return candidatesOf(run.results).flatMap((candidate) => {
    const codes = run.results.flatMap((result) =>
      result.candidate === candidate && result.outcome.type === 'error'
        ? [result.outcome.code]
        : [],
    );
    if (codes.length === 0) return [];
    const counts = [...Map.groupBy(codes, (code) => code)].map(
      ([code, list]) => `${code} ×${list.length}`,
    );
    return [`- ${candidate}: ${counts.join(', ')}`];
  });
}

function candidatesOf(results: RunResult[]): string[] {
  return [...new Set(results.map((result) => result.candidate))];
}

function doneOf(results: RunResult[]) {
  return results.flatMap((result) => (result.outcome.type === 'done' ? [result.outcome] : []));
}

function verdictsOf(results: RunResult[]) {
  return results.flatMap((result) => (result.verdict ? [result.verdict] : []));
}

function costs(priced: { costUsd?: number }[]): number[] {
  return priced.flatMap(({ costUsd }) => (costUsd === undefined ? [] : [costUsd]));
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ')} |`;
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
    '\n',
  );
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? mean(sorted.slice(middle - 1, middle + 1))
    : (sorted[middle] ?? Number.NaN);
}

function fixed(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : NONE;
}
