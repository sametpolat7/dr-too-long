import type { Point } from '@dr-too-long/shared/contracts';
import type { Sentence } from '@dr-too-long/shared/segmentation';
import { HIGHLIGHT_NAME } from '../../highlight.ts';
import { findText, type PageText, rangeOf, readPageText } from './page-text.ts';

export interface Anchors {
  activate(point: Point): boolean;
  clear(): void;
}

type Finder = (text: string) => Range | null;

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
      if (!first) {
        CSS.highlights.delete(HIGHLIGHT_NAME);
        return false;
      }
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

function locate(pageText: PageText, sentence: Sentence, find: Finder): Range | null {
  const range = rangeOf(pageText, sentence.start, sentence.end);
  return range && readPageText(range).text === sentence.text ? range : find(sentence.text);
}

function createFinder(root: Node): Finder {
  const containers = [...new Set([root, document.body])].filter((node) => node.isConnected);
  const walks = new Map<Node, PageText>();
  return (text) => {
    for (const container of containers) {
      const fresh = walks.get(container) ?? readPageText(contentsOf(container));
      walks.set(container, fresh);
      const range = findText(fresh, text);
      if (range) return range;
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
  let target = range.startContainer.parentElement;
  // A display: contents wrapper has no box to scroll into view.
  while (target && getComputedStyle(target).display === 'contents') target = target.parentElement;
  target?.scrollIntoView({ block: 'center', behavior });
}
