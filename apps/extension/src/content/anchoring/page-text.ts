interface Chunk {
  start: number;
  node: Text;
  offset: number;
}

export interface PageText {
  text: string;
  chunks: Chunk[];
  root: Node;
}

const BLOCK_DISPLAY = /^(block|flex|grid|table|list-item|flow-root)/;
const ABSOLUTELY_POSITIONED = /^(absolute|fixed)$/;
const FLOATED = /^(left|right|inline-start|inline-end)$/;
const FLEX_OR_GRID = /(flex|grid)$/;
const WORD = /\S+/g;
const HAS_WORD = /\S/;

// The text the reader sees inside the range, with one space per whitespace run, a line break at
// every block edge and each word's place in the DOM, so a sentence's offsets lead back to its nodes.
export function readPageText(range: Range): PageText {
  const root = walkRoot(range);
  const probe = document.createRange();
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    (node) => accept(node, range, probe),
  );
  const chunks: Chunk[] = [];
  let text = '';
  let pendingSpace = false;
  let block: Element | null | undefined;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      // A <br>, or a block standing in the line's own block rather than inside an inline box such as
      // an icon link, ends the line. The break waits for the next word, so a range ending at a
      // block's edge gains none.
      if (node.nodeName === 'BR' || node.parentElement === block) block = undefined;
      continue;
    }
    const container = blockContainer(node);
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    const data = node.data.slice(from, to);
    let scanned = 0;
    for (const match of data.matchAll(WORD)) {
      if (container !== block) {
        if (text !== '') text += '\n';
        block = container;
      } else if (pendingSpace || match.index > scanned) {
        text += ' ';
      }
      pendingSpace = false;
      chunks.push({ start: text.length, node, offset: from + match.index });
      text += match[0];
      scanned = match.index + match[0].length;
    }
    if (scanned < data.length) pendingSpace = true;
  }
  return { text, chunks, root };
}

// Null once a node left the page or shrank.
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

export function findText(pageText: PageText, needle: string): Range | null {
  const start = pageText.text.indexOf(needle);
  return start === -1 ? null : rangeOf(pageText, start, start + needle.length);
}

// A walker never returns its own root, so a selection inside one text node starts at the parent.
function walkRoot({ commonAncestorContainer: node }: Range): Node {
  return node instanceof Text ? (node.parentNode ?? node) : node;
}

function accept(node: Node, range: Range, probe: Range): number {
  if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
  if (node instanceof Text) {
    return laidOut(node, probe) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  }
  if (node instanceof Element && !node.checkVisibility()) {
    // A display: contents element has no box of its own while its children render.
    return getComputedStyle(node).display === 'contents'
      ? NodeFilter.FILTER_SKIP
      : NodeFilter.FILTER_REJECT;
  }
  return node.nodeName === 'BR' || (node instanceof Element && isBlock(node))
    ? NodeFilter.FILTER_ACCEPT
    : NodeFilter.FILTER_SKIP;
}

// Media, canvas, iframe, progress and meter elements, an object that loaded and a text area keep a
// box but lay out none of the fallback text or default value inside them, so a range over that text
// has no rects. Only text with words is measured, which keeps the spacing as it was and skips the
// whitespace between blocks.
function laidOut(text: Text, probe: Range): boolean {
  if (!HAS_WORD.test(text.data)) return true;
  probe.selectNodeContents(text);
  return probe.getClientRects().length > 0;
}

function blockContainer(node: Text): Element | null {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (isBlock(element)) return element;
  }
  return null;
}

// Floated and absolutely positioned elements compute as blocks but leave the line around them
// unbroken, except a flex or grid item, whose float is ignored.
function isBlock(element: Element): boolean {
  const { display, position, cssFloat } = getComputedStyle(element);
  if (!BLOCK_DISPLAY.test(display) || ABSOLUTELY_POSITIONED.test(position)) return false;
  if (!FLOATED.test(cssFloat)) return true;
  const parent = element.parentElement;
  return parent !== null && FLEX_OR_GRID.test(getComputedStyle(parent).display);
}

function holds(node: Text, offset: number): boolean {
  return node.isConnected && offset <= node.length;
}
