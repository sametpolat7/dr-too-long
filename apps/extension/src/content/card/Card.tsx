import { type ErrorCode, type Point, SHAPE_IDS, type ShapeId } from '@dr-too-long/shared/contracts';
import { type ComponentChild, Fragment } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ERROR_MESSAGES } from '../../error-messages.ts';
import { LanguagePicker } from '../../LanguagePicker.tsx';
import { type LanguageChoice, textDirection } from '../../languages.ts';
import type { Theme } from '../theme.ts';
import { copyText, separatorAfter } from './copy.ts';
import { useDrag } from './drag.ts';
import { type CardState, type ErrorState, type View, viewKey } from './view.ts';

const SHAPE_LABELS: Record<ShapeId, string> = {
  summary: 'Summary',
  'key-points': 'Key points',
};

// Errors that running the same request again can clear, and errors only the settings page can.
const RETRYABLE = new Set<ErrorCode>([
  'rate_limited',
  'network',
  'timed_out',
  'disconnected',
  'invalid_output',
  'provider',
  'unexpected',
]);
const SETTINGS_ERRORS = new Set<ErrorCode>(['no_key', 'unauthorized', 'model_unavailable']);

const HINT = 'Click a point to see where it comes from.';
const COPIED_MS = 2000;
const COPY_TIPS = {
  ready: 'Copy summary',
  copied: 'Copied',
  failed: 'This page does not allow copying',
};
// A press that moves further than this before the click selected words in the point.
const DRAG_PX = 4;

interface CardProps {
  state: CardState;
  // The page's scheme, which the card's colors follow.
  theme?: Theme;
  // Absent when the selection was refused.
  view?: View;
  choice: LanguageChoice;
  onSelect: (shape: ShapeId) => void;
  onLanguage: (choice: LanguageChoice) => void;
  onRetry: () => void;
  onClose: () => void;
  onOpenOptions: () => void;
  onActivate: (point: Point) => boolean;
}

// What the status line says after an action; a hidden one is for screen readers only, beside a
// button whose own label already shows it.
interface Notice {
  text: string;
  visible: boolean;
}

// The card's own text is English and left to right, whatever the page's language and direction.
export function Card({
  state,
  theme = 'light',
  view,
  choice,
  onSelect,
  onLanguage,
  onClose,
  ...body
}: CardProps) {
  const card = useRef<HTMLElement>(null);
  const drag = useDrag(card);
  useLayoutEffect(() => {
    card.current?.showPopover();
  }, []);
  // A notice lapses once the card shows another state or view. Each has its own number, so that
  // screen readers announce a repeated one again.
  const [noted, setNoted] = useState<{
    state: CardState;
    view?: string;
    notice: Notice;
    n: number;
  }>();
  const notices = useRef(0);
  const shown = view && viewKey(view);
  const current = noted?.state === state && noted.view === shown ? noted : undefined;
  const setNotice = (next: Notice | undefined) =>
    setNoted(next && { state, view: shown, notice: next, n: ++notices.current });
  return (
    <section
      ref={card}
      class="card"
      popover="manual"
      data-theme={theme}
      role="dialog"
      aria-labelledby="card-title"
      tabIndex={-1}
      lang="en"
      dir="ltr"
      // The language picker cancels the Escape that closes its list.
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) onClose();
      }}
    >
      <header {...drag}>
        <span
          class="grip"
          data-tip="Drag to move"
          // Dragging needs a pointer, so screen readers skip the grip and its tooltip.
          aria-hidden="true"
        >
          <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true">
            <circle cx="2.5" cy="3" r="1.3" />
            <circle cx="7.5" cy="3" r="1.3" />
            <circle cx="2.5" cy="8" r="1.3" />
            <circle cx="7.5" cy="8" r="1.3" />
            <circle cx="2.5" cy="13" r="1.3" />
            <circle cx="7.5" cy="13" r="1.3" />
          </svg>
        </span>
        <h2 class="visually-hidden" id="card-title">
          Dr. Too Long
        </h2>
        {view && (
          <div class="tools">
            <Shapes selected={view.shape} onSelect={onSelect} />
            <LanguagePicker choice={choice} onChange={onLanguage} label="Summary language" />
          </div>
        )}
        <button
          type="button"
          class="icon"
          onClick={onClose}
          aria-label="Close"
          data-tip="Close (Esc)"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </header>
      {view ? (
        <>
          <div class="body">
            <Body state={state} view={view} onNotice={setNotice} {...body} />
          </div>
          <footer>
            <Status state={state} notice={current?.notice} n={current?.n} />
            {state.status === 'done' && (
              <CopyButton
                key={shown}
                text={copyText(view.shape, state.points)}
                onNotice={setNotice}
              />
            )}
          </footer>
        </>
      ) : (
        state.status === 'error' && (
          <div class="body">
            <Failure state={state} {...body} />
          </div>
        )
      )}
    </section>
  );
}

interface ShapesProps {
  selected: ShapeId;
  onSelect: CardProps['onSelect'];
}

function Shapes({ selected, onSelect }: ShapesProps) {
  return (
    <fieldset class="shapes" aria-label="Shape">
      {SHAPE_IDS.map((id) => (
        <button key={id} type="button" aria-pressed={id === selected} onClick={() => onSelect(id)}>
          {SHAPE_LABELS[id]}
        </button>
      ))}
    </fieldset>
  );
}

interface BodyProps extends Pick<CardProps, 'onRetry' | 'onOpenOptions' | 'onActivate'> {
  state: CardState;
  view: View;
  onNotice: (notice: Notice | undefined) => void;
}

function Body({ state, view, onRetry, onOpenOptions, onActivate, onNotice }: BodyProps) {
  switch (state.status) {
    case 'error':
      return <Failure state={state} onRetry={onRetry} onOpenOptions={onOpenOptions} />;
    case 'summarizing':
      if (state.points.length === 0) return <Skeleton />;
      return (
        <Points view={view} points={state.points}>
          {(point) => point.text}
        </Points>
      );
    case 'done':
      return (
        <Summary
          key={viewKey(view)}
          view={view}
          points={state.points}
          onActivate={onActivate}
          onNotice={onNotice}
        />
      );
  }
}

function Skeleton() {
  return (
    <div class="skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

interface StatusProps {
  state: CardState;
  notice: Notice | undefined;
  n: number | undefined;
}

// Stays mounted while the card shows a view, so screen readers announce each change. Streamed
// points are left out of it: only the start and the end of a summary are announced.
function Status({ state, notice, n }: StatusProps) {
  let visible = '';
  let spoken = '';
  if (state.status === 'summarizing') visible = 'Summarizing…';
  else if (state.status === 'done' && notice?.visible) visible = notice.text;
  else if (state.status === 'done') {
    visible = HINT;
    spoken = notice?.text ?? 'Summary ready.';
  }
  return (
    <p class="status" role="status">
      {spoken && (
        <span key={n} class="visually-hidden">
          {spoken}
        </span>
      )}
      {visible}
    </p>
  );
}

interface FailureProps extends Pick<CardProps, 'onRetry' | 'onOpenOptions'> {
  state: ErrorState;
}

function Failure({ state, onRetry, onOpenOptions }: FailureProps) {
  return (
    <div class="failure">
      <div role="alert">
        <p class="error">{ERROR_MESSAGES[state.code]}</p>
        {state.detail && <p class="detail">{state.detail}</p>}
      </div>
      <div class="actions">
        {SETTINGS_ERRORS.has(state.code) && (
          <button type="button" class="btn" onClick={onOpenOptions}>
            Open settings
          </button>
        )}
        {RETRYABLE.has(state.code) && (
          <button type="button" class="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

interface PointsProps {
  view: View;
  points: Point[];
  children: (point: Point, index: number) => ComponentChild;
}

// The language's own direction, even when a point starts with a name in another script.
function Points({ view: { shape, language }, points, children }: PointsProps) {
  const text = { lang: language, dir: textDirection(language) };
  if (shape === 'key-points') {
    return (
      <ul {...text}>
        {points.map((point, index) => (
          <li key={index}>{children(point, index)}</li>
        ))}
      </ul>
    );
  }
  return (
    <p {...text}>
      {points.map((point, index) => (
        <Fragment key={index}>
          {index > 0 && separatorAfter(points[index - 1]?.text ?? '')}
          {children(point, index)}
        </Fragment>
      ))}
    </p>
  );
}

interface Active {
  index: number;
  found: boolean;
}

interface SummaryProps {
  view: View;
  points: Point[];
  onActivate: CardProps['onActivate'];
  onNotice: BodyProps['onNotice'];
}

function Summary({ view, points, onActivate, onNotice }: SummaryProps) {
  const [active, setActive] = useState<Active>();
  const pressedAt = useRef<{ x: number; y: number }>(undefined);
  const activate = (index: number, point: Point) => {
    const found = onActivate(point);
    setActive({ index, found });
    onNotice(found ? undefined : { text: 'The passage is no longer on the page.', visible: true });
  };
  // A drag or a double click selects words to copy; it does not jump to the passage.
  const selecting = (event: MouseEvent) => {
    const start = pressedAt.current;
    const moved =
      start !== undefined && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_PX;
    return event.detail > 1 || moved;
  };
  return (
    <Points view={view} points={points}>
      {(point, index) => (
        // biome-ignore lint/a11y/useSemanticElements: a button box cannot wrap across lines, so the points would stack.
        <span
          role="button"
          tabIndex={0}
          class={pointClass(active, index)}
          aria-pressed={active?.index === index}
          onMouseDown={(event) => {
            pressedAt.current = { x: event.clientX, y: event.clientY };
          }}
          onClick={(event) => {
            if (!selecting(event)) activate(index, point);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              activate(index, point);
            }
          }}
        >
          {point.text}
        </span>
      )}
    </Points>
  );
}

function pointClass(active: Active | undefined, index: number): string {
  if (active?.index !== index) return 'point';
  return active.found ? 'point active' : 'point missing';
}

interface CopyButtonProps {
  text: string;
  onNotice: BodyProps['onNotice'];
}

function CopyButton({ text, onNotice }: CopyButtonProps) {
  const [result, setResult] = useState<'copied' | 'failed'>();
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(undefined), COPIED_MS);
    return () => clearTimeout(timer);
  }, [result]);

  // The Clipboard API needs the click's user activation and a secure page; http pages have none.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setResult('copied');
      onNotice({ text: 'Summary copied.', visible: false });
    } catch {
      setResult('failed');
      onNotice({ text: 'The page does not allow copying.', visible: false });
    }
  };
  return (
    <button
      type="button"
      class="icon"
      onClick={copy}
      aria-label="Copy summary"
      data-tip={COPY_TIPS[result ?? 'ready']}
    >
      {result === 'copied' ? (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M3 8.5l3.2 3.2L13 4.8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      ) : (
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          aria-hidden="true"
        >
          <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.6" />
          <path d="M10.5 5.5V3.6A1.6 1.6 0 0 0 8.9 2H3.6A1.6 1.6 0 0 0 2 3.6v5.3a1.6 1.6 0 0 0 1.6 1.6h1.9" />
        </svg>
      )}
    </button>
  );
}
