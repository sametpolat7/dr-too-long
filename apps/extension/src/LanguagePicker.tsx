import { useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { LANGUAGE_TAGS, type LanguageChoice } from './languages.ts';

interface Option {
  choice: LanguageChoice;
  label: string;
}

const DISPLAY = { type: 'language', languageDisplay: 'standard' } as const;
const inEnglish = new Intl.DisplayNames(['en'], DISPLAY);

// English name first, for an English page. Standard names put a qualifier after the language, so
// Chinese (Simplified) sorts beside Chinese (Traditional).
function languageLabel(tag: string): string {
  const english = inEnglish.of(tag) ?? tag;
  const own = new Intl.DisplayNames([tag], DISPLAY).of(tag) ?? tag;
  return own === english ? english : `${english} — ${own}`;
}

const collator = new Intl.Collator('en');

// Built here, where the list is shown, so the worker never pays for the labels.
const LANGUAGES: Option[] = LANGUAGE_TAGS.map((tag) => ({
  choice: tag,
  label: languageLabel(tag),
})).sort((a, b) => collator.compare(a.label, b.label));

function autoOption(): Option {
  const { language } = new Intl.Locale(browser.i18n.getUILanguage());
  return { choice: null, label: `Auto (${inEnglish.of(language)})` };
}

// Drops case and accents, so "turk" finds "Türkçe".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();

function search(options: Option[], query: string): Option[] {
  const folded = fold(query.trim());
  return options.filter(({ label }) => fold(label).includes(folded));
}

// Scrolls the list alone: scrollIntoView could also scroll the page behind the summary window.
function keepInView(list: HTMLElement, option: HTMLElement) {
  const bottom = option.offsetTop + option.offsetHeight;
  if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

const LIST_HEIGHT = 260;
const LIST_MIN = 96;
const LIST_WIDTH = 280;
// The gap between the field and the list, and the margin the list keeps from the window's top and
// bottom edges.
const LIST_SPACE = 12;
// The margin the list keeps from the window's left and right edges.
const LIST_EDGE = 8;

interface Fit {
  side: 'up' | 'down';
  height: number;
  width: number;
  // How far the list runs past the field's right edge.
  shift: number;
}

// The list opens down unless there is more room above, as in a summary window dragged to the
// bottom of the viewport, and is never taller than the room on its side, so it stays on screen.
// It is right-aligned to the field, unless that runs it off the window's left edge.
export function fitList(field: DOMRect, viewport: { width: number; height: number }): Fit {
  const room = { up: field.top - LIST_SPACE, down: viewport.height - field.bottom - LIST_SPACE };
  const side = room.down >= LIST_HEIGHT || room.down >= room.up ? 'down' : 'up';
  const width = Math.min(LIST_WIDTH, viewport.width - 2 * LIST_EDGE);
  return {
    side,
    height: Math.max(LIST_MIN, Math.min(LIST_HEIGHT, room[side])),
    width,
    shift: Math.max(0, LIST_EDGE - (field.right - width)),
  };
}

interface LanguagePickerProps {
  choice: LanguageChoice;
  onChange: (choice: LanguageChoice) => void;
  // For screen readers only; on screen, the globe in the field stands for it.
  label: string;
}

// A combobox in the WAI-ARIA list autocomplete pattern.
export function LanguagePicker({ choice, onChange, label }: LanguagePickerProps) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [expanded, setExpanded] = useState(false);
  // What the reader typed, or null while the field shows the chosen language.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [fit, setFit] = useState<Fit>({
    side: 'down',
    height: LIST_HEIGHT,
    width: LIST_WIDTH,
    shift: 0,
  });

  const options = useMemo(() => [autoOption(), ...LANGUAGES], []);
  const chosen = options.findIndex((option) => option.choice === choice);
  const matches = query === null ? options : search(options, query);
  const current = expanded ? matches[active] : undefined;
  const text = query ?? options[chosen]?.label ?? '';

  // The chosen language's name stays selected while the field has the focus, so typing replaces it.
  useLayoutEffect(() => {
    if (focused.current && query === null) field.current?.select();
  }, [query, text]);

  useLayoutEffect(() => {
    const box = field.current?.getBoundingClientRect();
    if (expanded && box) {
      setFit(fitList(box, { width: window.innerWidth, height: window.innerHeight }));
    }
  }, [expanded]);

  // Keeps the active option in view, also once the list is fitted to its room.
  useLayoutEffect(() => {
    const option = list.current?.children[active];
    if (expanded && list.current && option instanceof HTMLElement) {
      keepInView(list.current, option);
    }
  }, [expanded, query, active, fit.height]);

  const open = () => {
    setExpanded(true);
    setQuery(null);
    setActive(Math.max(chosen, 0));
  };
  const close = () => {
    setExpanded(false);
    setQuery(null);
  };
  const choose = (option: Option) => {
    close();
    if (option.choice !== choice) onChange(option.choice);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) open();
      else if (matches.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((active + step + matches.length) % matches.length);
      }
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      choose(current);
    } else if (event.key === 'Escape' && expanded) {
      // Closes the list alone, not the summary window around it.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div class="picker">
      <label for={id} class="visually-hidden">
        {label}
      </label>
      <div class="field">
        <svg
          class="globe"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.3" />
          <path d="M1.7 8h12.6M8 1.7c1.8 2 2.6 4.1 2.6 6.3S9.8 12.3 8 14.3M8 1.7C6.2 3.7 5.4 5.8 5.4 8s.8 4.3 2.6 6.3" />
        </svg>
        <input
          ref={field}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          aria-activedescendant={current && `${id}-${active}`}
          autocomplete="off"
          spellcheck={false}
          value={text}
          onFocus={(event) => {
            focused.current = true;
            event.currentTarget.select();
            open();
          }}
          onBlur={() => {
            focused.current = false;
            close();
          }}
          // A press in the field places the caret after focus has selected the text.
          onClick={(event) => {
            if (query !== null) return;
            event.currentTarget.select();
            if (!expanded) open();
          }}
          onInput={(event) => {
            setExpanded(true);
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <svg class="chev" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          hidden={!expanded}
          data-side={fit.side}
          style={{
            maxHeight: `${fit.height}px`,
            width: `${fit.width}px`,
            right: `${-fit.shift}px`,
          }}
          // Keeps the focus in the field, so a click on an option does not close the list first.
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.length > 0 ? (
            matches.map((option, index) => (
              // biome-ignore lint/a11y/useFocusableInteractive: the field keeps the focus and points at the active option with aria-activedescendant.
              // biome-ignore lint/a11y/useKeyWithClickEvents: the field handles the keys for the list.
              <div
                key={option.label}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.choice === choice && (
                  <span class="check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>
            ))
          ) : (
            <div class="empty" aria-hidden="true">
              No language matches
            </div>
          )}
        </div>
        <span class="visually-hidden" role="status">
          {expanded && matches.length === 0 ? 'No language matches' : ''}
        </span>
      </div>
    </div>
  );
}
