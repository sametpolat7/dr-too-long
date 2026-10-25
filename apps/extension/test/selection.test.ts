import { MAX_SELECTION_CHARS } from '@dr-too-long/shared/limits';
import { beforeEach, describe, expect, it } from 'vitest';
import { selectionRequest } from '../src/content/selection.ts';

function select(html: string, selector: string): Selection {
  document.body.innerHTML = html;
  const target = document.querySelector(selector);
  const selection = window.getSelection();
  if (!target || !selection) throw new Error('Nothing to select');
  selection.selectAllChildren(target);
  return selection;
}

const unsupported = { ok: false, code: 'unsupported_selection' };

describe('selectionRequest', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports no_selection without a selection or with a collapsed one', () => {
    expect(selectionRequest(null, 'en')).toEqual({ ok: false, code: 'no_selection' });
    const selection = select('<p>Text.</p>', 'p');
    selection.removeAllRanges();
    expect(selectionRequest(selection, 'en')).toEqual({ ok: false, code: 'no_selection' });
  });

  it('reports no_selection for whitespace', () => {
    const selection = select('<p>   </p>', 'p');
    expect(selectionRequest(selection, 'en')).toEqual({ ok: false, code: 'no_selection' });
  });

  it.each([
    ['a text area', '<textarea>Draft text.</textarea>', 'textarea'],
    ['an editable region', '<div contenteditable="true"><p>Draft text.</p></div>', 'p'],
  ])('reports unsupported_selection inside %s', (_, html, selector) => {
    expect(selectionRequest(select(html, selector), 'en')).toEqual(unsupported);
  });

  it('reports unsupported_selection while a text control holds the focus', () => {
    const selection = select('<div><textarea>Draft text.</textarea></div>', 'div');
    document.querySelector('textarea')?.focus();
    expect(selectionRequest(selection, 'en')).toEqual(unsupported);
  });

  it('reports unsupported_selection while an embedded frame holds the focus', () => {
    document.body.innerHTML = '<iframe title="embed"></iframe>';
    document.querySelector('iframe')?.focus();
    expect(selectionRequest(window.getSelection(), 'en')).toEqual(unsupported);
  });

  it('reports unsupported_selection when the text sits in a shadow tree', () => {
    const selection = {
      anchorNode: null,
      focusNode: null,
      toString: () => 'Text inside a widget.',
      getRangeAt: () => ({ toString: () => '' }),
    } as unknown as Selection;
    expect(selectionRequest(selection, 'en')).toEqual(unsupported);
  });

  it('builds a summary request from the selected sentences', () => {
    const selection = select('<p>First sentence. Second sentence.</p>', 'p');
    expect(selectionRequest(selection, 'tr')).toEqual({
      ok: true,
      request: {
        v: 1,
        preset: 'summary',
        outputLanguage: 'tr',
        sentences: ['First sentence.', 'Second sentence.'],
      },
    });
  });

  it('refuses a selection above the character limit and names the count', () => {
    const text = 'x'.repeat(MAX_SELECTION_CHARS + 1);
    expect(selectionRequest(select(`<p>${text}</p>`, 'p'), 'en')).toEqual({
      ok: false,
      code: 'too_long',
      detail: '10,001 characters; the limit is 10,000.',
    });
  });
});
