import { segmentSentences } from '@dr-too-long/shared/segmentation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findText, rangeOf, readPageText } from '../src/content/anchoring/page-text.ts';

function mount(html: string): Range {
  document.body.innerHTML = html;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  return range;
}

function textNode(selector: string): Text {
  const node = document.querySelector(selector)?.firstChild;
  if (!(node instanceof Text)) throw new Error(`No text node in ${selector}`);
  return node;
}

// happy-dom neither blockifies floated, positioned or grid-placed elements nor fills cssFloat, so
// the matching elements get the values Chrome computes for them.
function computeAs(styles: Record<string, object>) {
  const computed = getComputedStyle;
  vi.stubGlobal('getComputedStyle', (element: Element) => {
    const selector = Object.keys(styles).find((key) => element.matches(key));
    return selector ? styles[selector] : computed(element);
  });
}

describe('readPageText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collapses whitespace and joins inline elements', () => {
    const range = mount('<p>One <em>two</em>,  three\n   four. Five</p>');
    expect(readPageText(range).text).toBe('One two, three four. Five');
  });

  it('skips hidden subtrees and scripts', () => {
    const range = mount(
      '<p>A.</p><div style="display: none"><p>Hidden.</p></div><script>var x;</script><p>B.</p>',
    );
    expect(readPageText(range).text).toBe('A.\nB.');
  });

  it('keeps text in a display: contents wrapper', () => {
    const range = mount('<p>Before.</p><div style="display: contents">Kept.</div><p>After.</p>');
    const wrapper = document.querySelector('div');
    if (!wrapper) throw new Error('No wrapper');
    vi.spyOn(wrapper, 'checkVisibility').mockReturnValue(false);
    expect(readPageText(range).text).toBe('Before.\nKept.\nAfter.');
  });

  it('breaks lines at block edges and line breaks', () => {
    const range = mount('<h2>Title</h2><p>Six<br>seven.</p><ul><li>Ten.</li><li>Eleven.</li></ul>');
    expect(readPageText(range).text).toBe('Title\nSix\nseven.\nTen.\nEleven.');
  });

  it('breaks the line at a block with no words', () => {
    const range = mount('<div>Chapter One<hr>It was a dark night.</div>');
    expect(readPageText(range).text).toBe('Chapter One\nIt was a dark night.');
  });

  it('keeps a block inside an inline box, such as an icon in a link, in its line', () => {
    const range = mount(
      '<p>See the <a style="display: inline-flex">docs<svg style="display: block"></svg></a> for more.</p>',
    );
    expect(readPageText(range).text).toBe('See the docs for more.');
  });

  it('keeps floated and absolutely positioned elements in their line', () => {
    const range = mount(
      '<p>Read the <a>guide<span class="hidden-label"> (opens in new tab)</span></a> first. <span class="drop-cap">T</span>hen start.</p>',
    );
    computeAs({
      '.hidden-label': { display: 'block', position: 'absolute' },
      '.drop-cap': { display: 'block', cssFloat: 'left' },
    });
    expect(readPageText(range).text).toBe('Read the guide (opens in new tab) first. Then start.');
  });

  it('breaks lines around floated grid items, whose float has no effect', () => {
    const range = mount(
      '<div class="grid"><div class="cell">Name</div><div class="cell">Value</div></div>',
    );
    computeAs({ '.grid': { display: 'grid' }, '.cell': { display: 'block', cssFloat: 'left' } });
    expect(readPageText(range).text).toBe('Name\nValue');
  });

  it('clips at range ends inside one text node', () => {
    mount('<p>One two three.</p>');
    const range = document.createRange();
    range.setStart(textNode('p'), 4);
    range.setEnd(textNode('p'), 7);
    const page = readPageText(range);
    expect(page.text).toBe('two');
    const back = rangeOf(page, 0, 3);
    expect(back && readPageText(back).text).toBe('two');
  });

  it('reads a selection made over an element', () => {
    mount('<p>First.</p><p>Second.</p>');
    const selection = window.getSelection();
    if (!selection) throw new Error('No selection');
    selection.selectAllChildren(document.body);
    expect(readPageText(selection.getRangeAt(0)).text).toBe('First.\nSecond.');
  });

  it.each([
    ['the element', (second: Element) => second],
    ['its text node', (second: Element) => second.firstChild ?? second],
  ])('leaves out a paragraph the range only touches at %s', (_, endContainer) => {
    mount('<p>First.</p><p>Second.</p>');
    const second = document.querySelectorAll('p')[1];
    if (!second) throw new Error('No second paragraph');
    const range = document.createRange();
    range.setStart(textNode('p'), 0);
    range.setEnd(endContainer(second), 0);
    const page = readPageText(range);
    expect(page.text).toBe('First.');
    expect(page.chunks.every((chunk) => !second.contains(chunk.node))).toBe(true);
  });

  it('maps every sentence back to a range that reads the same', () => {
    const range = mount(
      '<h2>A title</h2><p>One <em>two</em>. Three\n four.</p><p>Five<br>six.</p>',
    );
    const page = readPageText(range);
    const sentences = segmentSentences(page.text);
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'A title',
      'One two.',
      'Three four.',
      'Five',
      'six.',
    ]);
    for (const { text, start, end } of sentences) {
      const back = rangeOf(page, start, end);
      expect(back && readPageText(back).text).toBe(text);
    }
  });
});

describe('rangeOf', () => {
  it('returns null once a node left the page or shrank below the offset', () => {
    const page = readPageText(mount('<p>One two.</p><p>Three four.</p>'));
    textNode('p').data = 'One';
    expect(rangeOf(page, 0, 8)).toBeNull();
    expect(rangeOf(page, 9, 20)).not.toBeNull();
    document.querySelectorAll('p')[1]?.remove();
    expect(rangeOf(page, 9, 20)).toBeNull();
  });
});

describe('findText', () => {
  it('finds a sentence by its text', () => {
    const page = readPageText(mount('<p>One two.</p><p>Three four.</p>'));
    const range = findText(page, 'Three four.');
    expect(range?.toString()).toBe('Three four.');
    expect(range?.startContainer).toBe(textNode('p:last-child'));
    expect(findText(page, 'Five.')).toBeNull();
  });
});
