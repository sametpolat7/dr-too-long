import { type ErrorCode, type Point, SHAPE_IDS, type ShapeId } from '@dr-too-long/shared/contracts';
import { type ComponentChild, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ERROR_MESSAGES } from '../../error-messages.ts';
import { LanguageSelect } from '../../LanguageSelect.tsx';
import { type LanguageChoice, textDirection } from '../../languages.ts';
import type { Theme } from '../theme.ts';
import { copyText, separatorAfter } from './copy.ts';
import { Mark } from './Mark.tsx';
import { type CardState, type ErrorState, type View, viewKey } from './view.ts';

const SHAPE_LABELS: Record<ShapeId, string> = {
  summary: 'Summary',
  'key-points': 'Key points',
};

// Errors that running the same request again can clear, and errors only the options page can.
const RETRYABLE = new Set<ErrorCode>([
  'rate_limited',
  'network',
  'timed_out',
  'disconnected',
  'invalid_output',
  'provider',
  'unexpected',
]);
const OPTIONS_ERRORS = new Set<ErrorCode>(['no_key', 'unauthorized', 'model_unavailable']);

const COPIED_MS = 2000;
const SETTLE_MS = 400;
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
  // Whether the bubble is hidden on this site in this tab.
  bubbleHidden: boolean;
  onBubble: (hidden: boolean) => void;
  onRegenerate: () => void;
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
// It is a non-modal dialog that takes the focus when it opens.
export function Card({
  state,
  theme = 'light',
  view,
  choice,
  onSelect,
  onLanguage,
  bubbleHidden,
  onBubble,
  onClose,
  ...body
}: CardProps) {
  // A notice lapses once the card shows another state or view.
  const [noted, setNoted] = useState<{ state: CardState; view?: string; notice: Notice }>();
  const shown = view && viewKey(view);
  const notice = noted?.state === state && noted.view === shown ? noted.notice : undefined;
  const setNotice = (next: Notice | undefined) =>
    setNoted(next && { state, view: shown, notice: next });
  return (
    <section
      class="card"
      data-theme={theme}
      role="dialog"
      aria-labelledby="card-title"
      tabIndex={-1}
      lang="en"
      dir="ltr"
    >
      <header>
        <h2 class="title" id="card-title">
          <Mark />
          Dr. Too Long
        </h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {view ? (
        <>
          <Shapes selected={view.shape} onSelect={onSelect} />
          <Body state={state} view={view} onNotice={setNotice} {...body} />
          <Status state={state} notice={notice} />
          <footer>
            <Language choice={choice} onLanguage={onLanguage} />
            <BubbleSwitch hidden={bubbleHidden} onBubble={onBubble} />
          </footer>
        </>
      ) : (
        state.status === 'error' && <Failure state={state} {...body} />
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

interface BodyProps extends Pick<CardProps, 'onRegenerate' | 'onOpenOptions' | 'onActivate'> {
  state: CardState;
  view: View;
  onNotice: (notice: Notice | undefined) => void;
}

function Body({ state, view, onRegenerate, onOpenOptions, onActivate, onNotice }: BodyProps) {
  switch (state.status) {
    case 'error':
      return <Failure state={state} onRegenerate={onRegenerate} onOpenOptions={onOpenOptions} />;
    case 'summarizing':
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
          onRegenerate={onRegenerate}
          onNotice={onNotice}
        />
      );
  }
}

// Stays mounted while the card shows a view, so screen readers announce each change. Streamed
// points are left out of it: only the start and the end of a summary are announced.
function Status({ state, notice }: { state: CardState; notice: Notice | undefined }) {
  let visible = '';
  let spoken = '';
  if (state.status === 'summarizing') visible = 'Summarizing…';
  else if (state.status === 'done' && notice?.visible) visible = notice.text;
  else if (state.status === 'done') spoken = notice?.text ?? 'Summary ready.';
  return (
    <p class={visible ? 'status' : 'status quiet'} role="status">
      {visible}
      {spoken && <span class="visually-hidden">{spoken}</span>}
    </p>
  );
}

interface FailureProps extends Pick<CardProps, 'onRegenerate' | 'onOpenOptions'> {
  state: ErrorState;
}

function Failure({ state, onRegenerate, onOpenOptions }: FailureProps) {
  return (
    <>
      <div role="alert">
        <p class="error">{ERROR_MESSAGES[state.code]}</p>
        {state.detail && <p class="detail">{state.detail}</p>}
      </div>
      <div class="actions">
        {OPTIONS_ERRORS.has(state.code) && (
          <button type="button" onClick={onOpenOptions}>
            Open options
          </button>
        )}
        {RETRYABLE.has(state.code) && (
          <button type="button" onClick={onRegenerate}>
            Try again
          </button>
        )}
      </div>
    </>
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
  onRegenerate: CardProps['onRegenerate'];
  onNotice: BodyProps['onNotice'];
}

function Summary({ view, points, onActivate, onRegenerate, onNotice }: SummaryProps) {
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
    <>
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
      <div class="actions">
        <CopyButton text={copyText(view.shape, points)} onNotice={onNotice} />
        <button type="button" onClick={onRegenerate}>
          Regenerate
        </button>
      </div>
    </>
  );
}

function pointClass(active: Active | undefined, index: number): string {
  if (active?.index !== index) return 'point';
  return active.found ? 'point active' : 'point missing';
}

interface LanguageProps {
  choice: LanguageChoice;
  onLanguage: CardProps['onLanguage'];
}

// Keeps its own value, because the card re-renders with the choice it opened with. A closed select
// fires change for each option the arrow keys or type-ahead pass, so only the option the reader
// settles on is run and saved.
function Language({ choice: saved, onLanguage }: LanguageProps) {
  const [choice, setChoice] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: LanguageChoice) => {
    setChoice(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onLanguage(next), SETTLE_MS);
  };
  return <LanguageSelect choice={choice} onChange={change} />;
}

interface BubbleSwitchProps {
  hidden: boolean;
  onBubble: CardProps['onBubble'];
}

function BubbleSwitch({ hidden, onBubble }: BubbleSwitchProps) {
  return (
    <button type="button" class="bubble-switch" onClick={() => onBubble(!hidden)}>
      {hidden
        ? 'Show the bubble on this site'
        : 'Hide the bubble on this site until the tab closes'}
    </button>
  );
}

interface CopyButtonProps {
  text: string;
  onNotice: BodyProps['onNotice'];
}

function CopyButton({ text, onNotice }: CopyButtonProps) {
  const [label, setLabel] = useState('Copy');
  useEffect(() => {
    if (label === 'Copy') return;
    const timer = setTimeout(() => setLabel('Copy'), COPIED_MS);
    return () => clearTimeout(timer);
  }, [label]);

  // The Clipboard API needs the click's user activation and a secure page; http pages have none.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel('Copied');
      onNotice({ text: 'Summary copied.', visible: false });
    } catch {
      setLabel('Copy failed');
      onNotice({ text: 'The page does not allow copying.', visible: false });
    }
  };
  return (
    <button type="button" onClick={copy}>
      {label}
    </button>
  );
}
