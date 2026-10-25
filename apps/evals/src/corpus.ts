import { readdirSync, readFileSync } from 'node:fs';
import {
  DEFAULT_PRESET,
  type PresetId,
  type SummarizeRequest,
  summarizeRequestSchema,
} from '@dr-too-long/shared/contracts';
import { segmentSentences } from '@dr-too-long/shared/segmentation';
import { z } from 'zod';

const CORPUS_DIR = new URL('../corpus/', import.meta.url);

export const LANGUAGES = ['en', 'tr'] as const;

const headerSchema = z.strictObject({
  title: z.string().min(1),
  language: z.enum(LANGUAGES),
  genre: z.string().min(1),
  source: z.url(),
  license: z.string().min(1),
});

export interface CorpusItem extends z.infer<typeof headerSchema> {
  id: string;
  text: string;
  sentences: string[];
}

export function loadCorpus(): CorpusItem[] {
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) =>
      parseItem(name.slice(0, -'.md'.length), readFileSync(new URL(name, CORPUS_DIR), 'utf8')),
    );
}

// A file is a header of `key: value` lines between two `---` lines, then the text.
export function parseItem(id: string, file: string): CorpusItem {
  const match = /^---\n(.*?)\n---\n(.*)$/s.exec(file);
  if (!match) throw new Error(`${id}: expected a header between two --- lines`);
  const [, header = '', body = ''] = match;
  const fields = Object.fromEntries(
    header.split('\n').map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }),
  );
  const text = body.trim();
  const item = {
    id,
    ...parse(id, headerSchema, fields),
    text,
    sentences: segmentSentences(text).map((sentence) => sentence.text),
  };
  // Fails at load time, not mid-run, when a text exceeds the selection limits.
  requestFor(item, DEFAULT_PRESET, item.language);
  return item;
}

export function requestFor(
  item: CorpusItem,
  preset: PresetId,
  outputLanguage: string,
): SummarizeRequest {
  const fields = { v: 1, preset, outputLanguage, sentences: item.sentences };
  return parse(item.id, summarizeRequestSchema, fields);
}

function parse<T>(id: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`${id}: ${z.prettifyError(result.error)}`);
  return result.data;
}
