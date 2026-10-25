import { DEFAULT_PRESET, type SummarizeRequest } from '@dr-too-long/shared/contracts';
import { MAX_SELECTION_CHARS } from '@dr-too-long/shared/limits';
import { segmentSentences } from '@dr-too-long/shared/segmentation';

export type SelectionOutcome =
  | { ok: true; request: SummarizeRequest }
  | { ok: false; code: 'no_selection' | 'unsupported_selection' | 'too_long'; detail?: string };

const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
const FRAME = 'iframe, frame, object, embed';

export function selectionRequest(
  selection: Selection | null,
  outputLanguage: string,
): SelectionOutcome {
  // The script runs in the top frame; a selection inside a child frame lives in a document it
  // cannot see, and the frame element holds the focus meanwhile.
  if (document.activeElement?.matches(FRAME)) return { ok: false, code: 'unsupported_selection' };
  const text = selection?.toString() ?? '';
  if (!selection || text.trim() === '') return { ok: false, code: 'no_selection' };
  if (isUnsupported(selection)) return { ok: false, code: 'unsupported_selection' };
  return buildRequest(text, outputLanguage);
}

// A text control keeps the focus while its text is selected. Chrome moves both ends of a selection
// inside a shadow tree to the host's position in the page, so that range has no text of its own.
function isUnsupported(selection: Selection): boolean {
  const nodes = [document.activeElement, selection.anchorNode, selection.focusNode];
  return (
    nodes.some((node) => node !== null && isEditable(node)) ||
    selection.getRangeAt(0).toString().trim() === ''
  );
}

function isEditable(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(EDITABLE) != null;
}

// The same measure the port server checks, so a request that passes here is never refused there.
function buildRequest(text: string, outputLanguage: string): SelectionOutcome {
  const sentences = segmentSentences(text).map((sentence) => sentence.text);
  const chars = sentences.join('').length;
  if (chars > MAX_SELECTION_CHARS) {
    return {
      ok: false,
      code: 'too_long',
      detail: `${chars.toLocaleString('en')} characters; the limit is ${MAX_SELECTION_CHARS.toLocaleString('en')}.`,
    };
  }
  return { ok: true, request: { v: 1, preset: DEFAULT_PRESET, outputLanguage, sentences } };
}
