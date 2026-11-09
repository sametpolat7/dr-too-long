import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fitList, LanguagePicker } from '../src/LanguagePicker.tsx';
import type { LanguageChoice } from '../src/languages.ts';

function show(choice: LanguageChoice = null) {
  const onChange = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    render(<LanguagePicker choice={choice} onChange={onChange} label="Language" />, container);
  });
  const field = container.querySelector('input') as HTMLInputElement;
  const list = container.querySelector('[role="listbox"]') as HTMLElement;
  return { container, field, list, onChange };
}

const labels = (list: HTMLElement) =>
  [...list.querySelectorAll('[role="option"]')].map((option) => option.firstChild?.textContent);

function activeLabel(field: HTMLInputElement): string | null | undefined {
  const id = field.getAttribute('aria-activedescendant');
  return id === null ? undefined : document.getElementById(id)?.firstChild?.textContent;
}

function focus(field: HTMLInputElement) {
  act(() => field.focus());
}

function type(field: HTMLInputElement, text: string) {
  act(() => {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(field: HTMLInputElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    field.dispatchEvent(event);
  });
  return event;
}

const isSelected = (field: HTMLInputElement) =>
  field.selectionStart === 0 && field.selectionEnd === field.value.length;

describe('LanguagePicker', () => {
  beforeEach(() => {
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('is a combobox named by its label, which controls a listbox', () => {
    const { container, field, list } = show();
    const label = container.querySelector('label');
    expect(label?.textContent).toBe('Language');
    expect(label?.htmlFor).toBe(field.id);
    expect(label?.className).toBe('visually-hidden');
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-autocomplete')).toBe('list');
    expect(field.getAttribute('aria-controls')).toBe(list.id);
    expect(list.getAttribute('role')).toBe('listbox');
  });

  it('shows a globe in the field, hidden from screen readers', () => {
    const globe = show().container.querySelector('.field > svg.globe');
    expect(globe?.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens its list below the field, or above when there is more room there', () => {
    const { field, list } = show();
    const at = vi.spyOn(field, 'getBoundingClientRect');
    at.mockReturnValue(new DOMRect(0, 40, 176, 30));
    focus(field);
    expect([list.dataset.side, list.style.maxHeight]).toEqual(['down', '260px']);
    expect([list.style.width, list.style.right]).toEqual(['280px', '-112px']);
    act(() => field.blur());
    at.mockReturnValue(new DOMRect(0, window.innerHeight - 60, 176, 30));
    focus(field);
    expect([list.dataset.side, list.style.maxHeight]).toEqual(['up', '260px']);
  });

  it('shows the chosen language with the list closed', () => {
    const { field, list } = show('tr');
    expect(field.value).toBe('Turkish — Türkçe');
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(field.hasAttribute('aria-activedescendant')).toBe(false);
    expect(list.hidden).toBe(true);
  });

  it("offers Auto, naming Chrome's language without its region, before every listed language", () => {
    const [auto, ...languages] = labels(show().list);
    expect(auto).toBe('Auto (English)');
    expect(languages).toHaveLength(47);
    fakeBrowser.i18n.getUILanguage = () => 'pt-BR';
    expect(show().field.value).toBe('Auto (Portuguese)');
  });

  it('labels a language by its English name, then its own', () => {
    const texts = labels(show().list);
    expect(texts).toContain('Turkish — Türkçe');
    expect(texts).toContain('English');
  });

  it('offers Chinese by script without naming a place, side by side', () => {
    const texts = labels(show().list);
    const simplified = texts.indexOf('Chinese (Simplified) — 中文（简体）');
    expect(simplified).toBeGreaterThan(0);
    expect(texts[simplified + 1]).toBe('Chinese (Traditional) — 中文（繁體）');
  });

  it('opens the whole list on focus, on the chosen language, with its name selected', () => {
    const { field, list } = show('tr');
    focus(field);
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect(labels(list)).toHaveLength(48);
    expect(activeLabel(field)).toBe('Turkish — Türkçe');
    expect(isSelected(field)).toBe(true);
  });

  it('marks the active option selected and the chosen one with a check', () => {
    const { field, list } = show('tr');
    focus(field);
    press(field, 'ArrowDown');
    const active = list.querySelectorAll('[aria-selected="true"]');
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(field.getAttribute('aria-activedescendant'));
    const checked = [...list.querySelectorAll('.check')].map((check) => check.parentElement);
    expect(checked.map((option) => option?.firstChild?.textContent)).toEqual(['Turkish — Türkçe']);
  });

  it.each([
    ['tur', 'Turkish — Türkçe'],
    ['türk', 'Turkish — Türkçe'],
    ['TÜRKÇE', 'Turkish — Türkçe'],
    ['deu', 'German — Deutsch'],
    ['日本', 'Japanese — 日本語'],
  ])('finds %s anywhere in a name, ignoring case and accents', (query, label) => {
    const { field, list } = show();
    focus(field);
    type(field, query);
    expect(labels(list)).toContain(label);
    expect(activeLabel(field)).toBe(labels(list)[0]);
  });

  it('says so when no language matches', () => {
    const { field, list, onChange } = show();
    focus(field);
    type(field, 'xyz');
    expect(labels(list)).toEqual([]);
    expect(list.textContent).toBe('No language matches');
    // Screen readers hear it from a status, not from the list.
    const status = list.parentElement?.querySelector('[role="status"]');
    expect(status?.textContent).toBe('No language matches');
    expect(field.hasAttribute('aria-activedescendant')).toBe(false);
    press(field, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moves through the list with the arrows, wrapping, without choosing', () => {
    const { field, list, onChange } = show();
    focus(field);
    const all = labels(list);
    press(field, 'ArrowUp');
    expect(activeLabel(field)).toBe(all.at(-1));
    press(field, 'ArrowDown');
    expect(activeLabel(field)).toBe('Auto (English)');
    press(field, 'ArrowDown');
    expect(activeLabel(field)).toBe(all[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('chooses the active option on Enter and closes the list', () => {
    const { field, list, onChange } = show();
    focus(field);
    type(field, 'deu');
    const enter = press(field, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('de');
    expect(list.hidden).toBe(true);
    expect(field.value).toBe('Auto (English)');
    expect(isSelected(field)).toBe(true);
  });

  it('reports nothing when the chosen language is chosen again', () => {
    const { field, onChange } = show('tr');
    focus(field);
    press(field, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the list on Escape, keeping the language, and keeps that Escape to itself', () => {
    const { container, field, list, onChange } = show('tr');
    const outside = vi.fn();
    container.addEventListener('keydown', outside);
    focus(field);
    type(field, 'deu');
    const first = press(field, 'Escape');
    expect(first.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    expect(list.hidden).toBe(true);
    expect(field.value).toBe('Turkish — Türkçe');
    expect(isSelected(field)).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    press(field, 'Escape');
    expect(outside).toHaveBeenCalledOnce();
  });

  it('opens on an arrow once closed', () => {
    const { field, list } = show('tr');
    focus(field);
    press(field, 'Escape');
    press(field, 'ArrowDown');
    expect(list.hidden).toBe(false);
    expect(activeLabel(field)).toBe('Turkish — Türkçe');
  });

  it('closes without a change when the focus leaves', () => {
    const { field, list, onChange } = show('tr');
    focus(field);
    type(field, 'deu');
    act(() => field.blur());
    expect(list.hidden).toBe(true);
    expect(field.value).toBe('Turkish — Türkçe');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the focus in the field on a press in the list, and chooses on a click', () => {
    const { field, list, onChange } = show();
    focus(field);
    const option = [...list.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (each) => each.firstChild?.textContent === 'Turkish — Türkçe',
    );
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option?.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    act(() => option?.click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('tr');
    expect(list.hidden).toBe(true);
  });

  it('reopens on a click in the field once a choice has closed the list', () => {
    const { field, list } = show();
    focus(field);
    press(field, 'Enter');
    expect(list.hidden).toBe(true);
    act(() => field.click());
    expect(list.hidden).toBe(false);
    expect(isSelected(field)).toBe(true);
  });
});

describe('fitList', () => {
  const field = (top: number, left = 600) => new DOMRect(left, top, 176, 30);
  const viewport = (height: number, width = 1000) => ({ width, height });

  it('opens down while there is room for the whole list, even with more room above', () => {
    expect(fitList(field(100), viewport(800))).toMatchObject({ side: 'down', height: 260 });
    expect(fitList(field(400), viewport(800))).toMatchObject({ side: 'down', height: 260 });
  });

  it('flips up when there is more room above', () => {
    expect(fitList(field(700), viewport(800))).toMatchObject({ side: 'up', height: 260 });
  });

  it('shortens the list to the room on its side', () => {
    expect(fitList(field(150), viewport(400))).toMatchObject({ side: 'down', height: 208 });
    expect(fitList(field(250), viewport(400))).toMatchObject({ side: 'up', height: 238 });
  });

  it('keeps a few rows even when neither side has room', () => {
    expect(fitList(field(40), viewport(120)).height).toBe(96);
  });

  it('right-aligns the list to the field, unless that runs it within 8 px of the left edge', () => {
    expect(fitList(field(100), viewport(800))).toMatchObject({ width: 280, shift: 0 });
    expect(fitList(field(100, 112), viewport(800))).toMatchObject({ width: 280, shift: 0 });
    expect(fitList(field(100, 30), viewport(800, 320))).toMatchObject({ width: 280, shift: 82 });
  });

  it('narrows the list to the window less 16 px', () => {
    expect(fitList(field(100, 10), viewport(800, 250))).toMatchObject({ width: 234, shift: 56 });
  });
});
