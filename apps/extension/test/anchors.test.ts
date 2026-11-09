import { segmentSentences } from '@dr-too-long/shared/segmentation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnchors } from '../src/content/anchoring/anchors.ts';
import { readPageText } from '../src/content/anchoring/page-text.ts';
import { BUBBLE_UI } from '../src/content/ui.ts';
import { HIGHLIGHT_NAME } from '../src/highlight.ts';
import { layOutText } from './helpers.ts';

class FakeHighlight extends Set<Range> {
  constructor(...ranges: Range[]) {
    super(ranges);
  }
}

let highlights: Map<string, FakeHighlight>;

function anchorsOver(selector: string) {
  const root = document.querySelector(selector);
  if (!root) throw new Error(`Nothing matches ${selector}`);
  const range = document.createRange();
  range.selectNodeContents(root);
  const pageText = readPageText(range);
  return createAnchors(pageText, segmentSentences(pageText.text));
}

const highlighted = () =>
  [...(highlights.get(HIGHLIGHT_NAME) ?? [])].map((range) => range.toString());

// Where the cited sentence's box stands in the viewport.
const sentenceAt = (box: DOMRect) =>
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(box);

// What the page shows at the sentence's centre, from the top: the paragraph holding it, under
// whatever covers it.
const shows = (...selectors: string[]) =>
  vi
    .spyOn(document, 'elementsFromPoint')
    .mockImplementation(() =>
      selectors.flatMap((selector) => document.querySelector(selector) ?? []),
    );

describe('createAnchors', () => {
  beforeEach(() => {
    highlights = new Map();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', FakeHighlight);
    layOutText();
    sentenceAt(new DOMRect(0, 2000, 600, 20));
    document.elementsFromPoint = () => [];
    document.body.innerHTML =
      '<section><p>One two. Three four.</p><p>Five six.</p></section><aside></aside>';
  });

  it('highlights the cited sentences and scrolls to the first', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const anchors = anchorsOver('section');
    expect(anchors.activate({ text: '', sentences: [1, 3] })).toBe(true);
    expect(highlighted()).toEqual(['One two.', 'Five six.']);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(scrollIntoView.mock.instances[0]).toBe(document.querySelector('p'));
  });

  it('scrolls the nearest element with a box when the passage sits in a display: contents wrapper', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    document.body.innerHTML = '<section><div style="display: contents">One two.</div></section>';
    expect(anchorsOver('section').activate({ text: '', sentences: [1] })).toBe(true);
    expect(scrollIntoView.mock.instances[0]).toBe(document.querySelector('section'));
  });

  it('centers the sentence itself when its element is taller than the window', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, -4000, 800, 9000),
    );
    sentenceAt(new DOMRect(0, 3000, 600, 40));
    expect(anchorsOver('section').activate({ text: '', sentences: [3] })).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).toHaveBeenCalledWith({
      top: 3000 - (window.innerHeight - 40) / 2,
      behavior: 'smooth',
    });
  });

  it('highlights a sentence already in sight without moving the page', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    sentenceAt(new DOMRect(0, 100, 600, 20));
    shows('section p');
    expect(anchorsOver('section').activate({ text: '', sentences: [2] })).toBe(true);
    expect(highlighted()).toEqual(['Three four.']);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('scrolls to a sentence in the viewport that something else covers', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    sentenceAt(new DOMRect(0, 100, 600, 20));
    shows('aside', 'section p');
    anchorsOver('section').activate({ text: '', sentences: [2] });
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it('leaves a sentence in sight under the Summarize button where it is', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    document.body.append(document.createElement(BUBBLE_UI));
    sentenceAt(new DOMRect(0, 100, 600, 20));
    shows(BUBBLE_UI, 'section p');
    anchorsOver('section').activate({ text: '', sentences: [2] });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([
    ['partly below the viewport', new DOMRect(0, window.innerHeight - 10, 600, 20)],
    ['past its right edge', new DOMRect(window.innerWidth - 100, 100, 600, 20)],
  ])('scrolls to a sentence %s', (_, box) => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    sentenceAt(box);
    anchorsOver('section').activate({ text: '', sentences: [1] });
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it.each([
    ['in sight', 50, false],
    ['hidden', 300, true],
  ])('scrolls only when its scroll container keeps an on-screen sentence %s', (_, top, scrolls) => {
    document.body.innerHTML =
      '<div style="overflow-y: auto"><section><p>One two.</p><p>Three four.</p></section></div>';
    const scroller = document.querySelector('div');
    if (!scroller) throw new Error('Fixture changed');
    Object.defineProperties(scroller, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 100 },
      clientWidth: { value: 600 },
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 600, 100),
    );
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    sentenceAt(new DOMRect(0, top, 600, 20));
    shows('section p + p');
    anchorsOver('section').activate({ text: '', sentences: [2] });
    expect(scrollIntoView).toHaveBeenCalledTimes(scrolls ? 1 : 0);
  });

  it('clears the selection, which would paint over the highlight', () => {
    const selection = window.getSelection();
    selection?.selectAllChildren(document.body);
    anchorsOver('section').activate({ text: '', sentences: [2] });
    expect(selection?.rangeCount).toBe(0);
  });

  it('re-finds a passage after the page re-rendered', () => {
    const anchors = anchorsOver('section');
    document.body.replaceWith(document.body.cloneNode(true));
    expect(anchors.activate({ text: '', sentences: [2] })).toBe(true);
    expect(highlighted()).toEqual(['Three four.']);
  });

  it('re-finds a passage moved out of its container', () => {
    const anchors = anchorsOver('section');
    const section = document.querySelector('section');
    const aside = document.querySelector('aside');
    if (!section || !aside) throw new Error('Fixture changed');
    section.innerHTML = '<p>Other text.</p>';
    aside.innerHTML = '<p>Five six.</p>';
    expect(anchors.activate({ text: '', sentences: [3] })).toBe(true);
    const [range] = highlights.get(HIGHLIGHT_NAME) ?? [];
    expect(range?.toString()).toBe('Five six.');
    expect(aside.contains(range?.startContainer ?? null)).toBe(true);
  });

  it('re-finds a passage whose text changed in place', () => {
    const anchors = anchorsOver('section');
    const first = document.querySelector('p')?.firstChild;
    const aside = document.querySelector('aside');
    if (!(first instanceof Text) || !aside) throw new Error('Fixture changed');
    first.data = 'Zzz zzz. Three four.';
    aside.innerHTML = '<p>One two.</p>';
    expect(anchors.activate({ text: '', sentences: [1] })).toBe(true);
    const [range] = highlights.get(HIGHLIGHT_NAME) ?? [];
    expect(range?.toString()).toBe('One two.');
    expect(aside.contains(range?.startContainer ?? null)).toBe(true);
  });

  it('re-finds a passage where it was before searching the whole page', () => {
    document.body.innerHTML =
      '<header><p>Three four.</p></header><section><p>One two. Three four.</p></section>';
    const anchors = anchorsOver('section');
    const section = document.querySelector('section');
    if (!section) throw new Error('Fixture changed');
    section.innerHTML = '<p>One two. Three four.</p>';
    expect(anchors.activate({ text: '', sentences: [2] })).toBe(true);
    const [range] = highlights.get(HIGHLIGHT_NAME) ?? [];
    expect(section.contains(range?.startContainer ?? null)).toBe(true);
  });

  it('reports a passage that is gone and leaves nothing highlighted', () => {
    const anchors = anchorsOver('section');
    anchors.activate({ text: '', sentences: [1] });
    document.querySelectorAll('p')[1]?.remove();
    expect(anchors.activate({ text: '', sentences: [3] })).toBe(false);
    expect(highlights.size).toBe(0);
  });

  it('skips a sentence number the input never had', () => {
    expect(anchorsOver('section').activate({ text: '', sentences: [9] })).toBe(false);
  });

  it('clears its highlight', () => {
    const anchors = anchorsOver('section');
    anchors.activate({ text: '', sentences: [1] });
    anchors.clear();
    expect(highlights.size).toBe(0);
  });
});
