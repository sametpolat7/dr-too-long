import { segmentSentences } from '@dr-too-long/shared/segmentation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnchors } from '../src/content/anchoring/anchors.ts';
import { readPageText } from '../src/content/anchoring/page-text.ts';
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

describe('createAnchors', () => {
  beforeEach(() => {
    highlights = new Map();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', FakeHighlight);
    layOutText();
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
