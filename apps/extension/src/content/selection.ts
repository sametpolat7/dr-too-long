import { MAX_SELECTION_CHARS } from '@dr-too-long/shared/limits';
import { type Sentence, segmentSentences } from '@dr-too-long/shared/segmentation';
import { type PageText, readPageText } from './anchoring/page-text.ts';

type SelectionOutcome =
  | { ok: true; sentences: Sentence[]; pageText: PageText }
  | { ok: false; code: 'no_selection' | 'unsupported_selection' | 'too_long'; detail?: string };

const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
const FRAME = 'iframe, frame, object, embed';

export function readSelection(selection: Selection | null): SelectionOutcome {
  if (inFrame()) return { ok: false, code: 'unsupported_selection' };
  if (!selection || selection.toString().trim() === '') return { ok: false, code: 'no_selection' };
  if (inEditable(selection)) return { ok: false, code: 'unsupported_selection' };
  return checkSentences(readPageText(selection.getRangeAt(0)));
}

// The script runs in the top frame; a selection inside a child frame lives in a document it cannot
// see, and the frame element holds the focus meanwhile.
export const inFrame = (): boolean => document.activeElement?.matches(FRAME) === true;

// A text control keeps the focus while its text is selected.
export function inEditable(selection: Selection): boolean {
  const nodes = [document.activeElement, selection.anchorNode, selection.focusNode];
  return nodes.some((node) => node !== null && isEditable(node));
}

function isEditable(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(EDITABLE) != null;
}

// The same measures the port server checks, so a request that passes here is never refused there.
function checkSentences(pageText: PageText): SelectionOutcome {
  const sentences = segmentSentences(pageText.text);
  // Chrome moves both ends of a selection inside a shadow tree to the host's position in the
  // page, so that range holds no text of its own.
  if (sentences.length === 0) return { ok: false, code: 'unsupported_selection' };
  const chars = sentences.map((sentence) => sentence.text).join('').length;
  if (chars > MAX_SELECTION_CHARS) {
    return {
      ok: false,
      code: 'too_long',
      detail: `${chars.toLocaleString('en')} characters; the limit is ${MAX_SELECTION_CHARS.toLocaleString('en')}.`,
    };
  }
  return { ok: true, sentences, pageText };
}
