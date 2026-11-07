export interface Sentence {
  text: string;
  start: number;
  end: number;
}

interface Span {
  start: number;
  end: number;
}

// ICU's root rules split sentences in any language, and a fixed locale keeps the result identical
// on every machine. No language's abbreviation or ordinal conventions are special-cased.
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const words = new Intl.Segmenter('en', { granularity: 'word' });

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

// The segmenter breaks after an initial that a capitalised word follows (J. R. Smith).
function isFalseBreak(segment: string): boolean {
  const trimmed = segment.trimEnd();
  if (LINE_BREAK.test(segment.slice(trimmed.length))) return false;
  const word = trimmed.slice(trimmed.search(/\S*$/)).replace(OPENING_PUNCTUATION, '');
  return UPPERCASE_INITIALS.test(word);
}

function trim(text: string, span: Span): Sentence | null {
  const raw = text.slice(span.start, span.end);
  const start = span.start + raw.length - raw.trimStart().length;
  const end = span.end - raw.length + raw.trimEnd().length;
  return start < end ? { text: text.slice(start, end), start, end } : null;
}

// The same root rules also split scripts written without spaces.
export function countWords(text: string): number {
  let count = 0;
  for (const { isWordLike } of words.segment(text)) if (isWordLike) count += 1;
  return count;
}
