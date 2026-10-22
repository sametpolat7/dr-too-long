import { ABBREVIATIONS } from './abbreviations.ts';

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

interface Span {
  start: number;
  end: number;
}

// English and Turkish share ICU's root sentence rules; a fixed locale keeps the result
// identical on every machine.
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

const LINE_BREAK = /[\n\r\u2028\u2029]/;
const OPENING_PUNCTUATION = /^[\p{Ps}\p{Pi}"']+/u;
const UPPERCASE_INITIALS = /^(?:\p{Lu}\.)+$/u;

export function segmentSentences(text: string): Sentence[] {
  const spans: Span[] = [];
  for (const { segment, index } of segmenter.segment(text)) {
    const previous = spans.at(-1);
    if (previous && isFalseBreak(text.slice(previous.start, previous.end))) {
      previous.end = index + segment.length;
    } else {
      spans.push({ start: index, end: index + segment.length });
    }
  }
  return spans.map((span) => trim(text, span)).filter((sentence) => sentence !== null);
}

// The segmenter breaks after any abbreviation that a capitalised word or a number follows.
function isFalseBreak(segment: string): boolean {
  const trimmed = segment.trimEnd();
  if (LINE_BREAK.test(segment.slice(trimmed.length))) return false;
  const word = trimmed.slice(trimmed.search(/\S*$/)).replace(OPENING_PUNCTUATION, '');
  return UPPERCASE_INITIALS.test(word) || ABBREVIATIONS.has(word.toLowerCase());
}

function trim(text: string, span: Span): Sentence | null {
  const raw = text.slice(span.start, span.end);
  const start = span.start + raw.length - raw.trimStart().length;
  const end = span.end - raw.length + raw.trimEnd().length;
  return start < end ? { text: text.slice(start, end), start, end } : null;
}
