import type { CorpusItem } from './corpus.ts';
import { shuffled } from './random.ts';
import { groupKey, type RunResult, readRun, writeRun } from './results.ts';

// Tests pass a fake.
export interface Terminal {
  ask(question: string): Promise<string>;
  print(text: string): void;
}

// Summaries are shown in random order without candidate ids, so the rating is blind.
export async function rateRun(
  path: string,
  corpus: CorpusItem[],
  terminal: Terminal,
  random: () => number = Math.random,
): Promise<void> {
  const run = readRun(path);
  const items = new Map(corpus.map((item) => [item.id, item]));
  const groups = Map.groupBy(run.results, groupKey);
  for (const group of groups.values()) {
    const pending = group.filter(
      (result) => result.outcome.type === 'done' && result.builderRating === undefined,
    );
    const [first] = pending;
    if (!first) continue;
    const item = items.get(first.item);
    if (!item) throw new Error(`${first.item} is not in the corpus`);

    terminal.print(
      `\n## ${item.title} · ${first.preset} · ${first.outputLanguage}\n\n${item.text}\n`,
    );
    for (const [index, result] of shuffled(pending, random).entries()) {
      const label = String.fromCharCode(65 + index);
      terminal.print(`\n${label}. ${summaryOf(result)}`);
      result.builderRating = await askRating(terminal, label);
      // Saved after every answer, so a stopped session keeps what was rated.
      writeRun(path, run);
    }
  }
}

function summaryOf({ outcome }: RunResult): string {
  return outcome.type === 'done' ? outcome.points.map((point) => point.text).join(' ') : '';
}

async function askRating(terminal: Terminal, label: string): Promise<number | undefined> {
  for (;;) {
    const answer = (
      await terminal.ask(`Rate ${label} from 1 to 5, or press Enter to skip: `)
    ).trim();
    if (answer === '') return undefined;
    const rating = Number(answer);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) return rating;
    terminal.print('Enter a whole number from 1 to 5.');
  }
}
