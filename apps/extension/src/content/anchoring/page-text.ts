export interface Chunk {
  start: number;
  node: Text;
  offset: number;
  length: number;
}

export interface PageText {
  text: string;
  chunks: Chunk[];
  root: Node;
}

export interface Span {
  start: number;
  end: number;
}

const BLOCK_DISPLAY = /^(block|flex|grid|table|list-item|flow-root)/;
const WORD = /\S+/g;

// The text the reader sees inside the range, with one space per whitespace run, a line break at
// every block edge and each word's place in the DOM, so a sentence's offsets lead back to its nodes.
export function readPageText(range: Range): PageText {
  const root = walkRoot(range);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    (node) => accept(node, range),
  );
  const chunks: Chunk[] = [];
  let text = '';
  let pendingSpace = false;
  let block: Element | null | undefined;

  const breakLine = () => {
    if (text !== '' && !text.endsWith('\n')) text += '\n';
    pendingSpace = false;
  };

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      breakLine();
      continue;
    }
    const container = blockContainer(node);
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    const data = node.data.slice(from, to);
    let scanned = 0;
    for (const match of data.matchAll(WORD)) {
      if (container !== block) {
        breakLine();
        block = container;
      }
      if ((pendingSpace || match.index > scanned) && text !== '' && !text.endsWith('\n')) {
        text += ' ';
      }
      pendingSpace = false;
      chunks.push({
        start: text.length,
        node,
        offset: from + match.index,
        length: match[0].length,
      });
      text += match[0];
      scanned = match.index + match[0].length;
    }
    if (scanned < data.length) pendingSpace = true;
  }
  return { text, chunks, root };
}

// A live range over the sentence at these offsets, or null once a node left the page or shrank.
export function rangeOf({ chunks }: PageText, start: number, end: number): Range | null {
  const first = chunks.findLast((chunk) => chunk.start <= start);
  const last = chunks.findLast((chunk) => chunk.start < end);
  if (!first || !last) return null;
  const startOffset = first.offset + start - first.start;
  const endOffset = last.offset + end - last.start;
  if (!holds(first.node, startOffset) || !holds(last.node, endOffset)) return null;
  const range = document.createRange();
  range.setStart(first.node, startOffset);
  range.setEnd(last.node, endOffset);
  return range;
}

export function findText({ text }: PageText, needle: string): Span | null {
  const start = text.indexOf(needle);
  return start === -1 ? null : { start, end: start + needle.length };
}

// A walker never returns its own root, so a selection inside one text node starts at the parent.
function walkRoot({ commonAncestorContainer: node }: Range): Node {
  return node instanceof Text ? (node.parentNode ?? node) : node;
}

function accept(node: Node, range: Range): number {
  if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
  if (node instanceof Text) return NodeFilter.FILTER_ACCEPT;
  if (node instanceof Element && !node.checkVisibility()) {
    // A display: contents element has no box of its own while its children render.
    return getComputedStyle(node).display === 'contents'
      ? NodeFilter.FILTER_SKIP
      : NodeFilter.FILTER_REJECT;
  }
  return node.nodeName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
}

function blockContainer(node: Text): Element | null {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (BLOCK_DISPLAY.test(getComputedStyle(element).display)) return element;
  }
  return null;
}

function holds(node: Text, offset: number): boolean {
  return node.isConnected && offset <= node.length;
}
