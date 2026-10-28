import type { Point } from '@dr-too-long/shared/contracts';
import type { Sentence } from '@dr-too-long/shared/segmentation';
import { HIGHLIGHT_NAME } from '../../highlight.ts';
import { findText, type PageText, rangeOf, readPageText } from './page-text.ts';

export interface Anchors {
  activate(point: Point): boolean;
  clear(): void;
}

type Finder = (text: string) => Range | null;

// Highlights the sentences a point cites and scrolls to the first; false when none is on the page.
export function createAnchors(pageText: PageText, sentences: Sentence[]): Anchors {
  return {
    activate(point) {
      const find = createFinder(pageText.root);
      const ranges = point.sentences.flatMap((n) => {
        const sentence = sentences[n - 1];
        const range = sentence && locate(pageText, sentence, find);
        return range ? [range] : [];
      });
      const first = ranges[0];
      if (!first) return false;
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
      // The selection paints above every custom highlight.
      window.getSelection()?.removeAllRanges();
      reveal(first);
      return true;
    },
    clear() {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    },
  };
}

// The sentence's own range while the page still reads the same there, otherwise a fresh search.
function locate(pageText: PageText, sentence: Sentence, find: Finder): Range | null {
  const range = rangeOf(pageText, sentence.start, sentence.end);
  return range && readPageText(range).text === sentence.text ? range : find(sentence.text);
}

// Looks for a re-rendered passage first where it was, then anywhere on the page, walking each once.
function createFinder(root: Node): Finder {
  const containers = [...new Set([root, document.body])].filter((node) => node.isConnected);
  const walks = new Map<Node, PageText>();
  return (text) => {
    for (const container of containers) {
      const fresh = walks.get(container) ?? readPageText(contentsOf(container));
      walks.set(container, fresh);
      const span = findText(fresh, text);
      if (span) return rangeOf(fresh, span.start, span.end);
    }
    return null;
  };
}

function contentsOf(node: Node): Range {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range;
}

function reveal(range: Range): void {
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior });
}
