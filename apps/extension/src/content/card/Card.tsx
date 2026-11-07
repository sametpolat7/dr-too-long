import {
  type ErrorCode,
  type Point,
  PRESET_IDS,
  type PresetId,
} from '@dr-too-long/shared/contracts';
import { type ComponentChild, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ERROR_MESSAGES } from '../../error-messages.ts';
import { LanguageSelect } from '../../LanguageSelect.tsx';
import { textDirection } from '../../languages.ts';
import { copyText } from './copy.ts';

type ErrorState = { status: 'error'; code: ErrorCode; detail?: string };

export type CardState =
  | { status: 'summarizing'; points: Point[] }
  | { status: 'done'; points: Point[] }
  | ErrorState;

export interface View {
  preset: PresetId;
  language: string;
}

export const viewKey = ({ preset, language }: View): string => `${preset} ${language}`;

const PRESET_LABELS: Record<PresetId, string> = {
  summary: 'Summary',
  'key-points': 'Key points',
};

// Errors that running the same request again can clear, and errors only the options page can.
const RETRYABLE = new Set<ErrorCode>([
  'rate_limited',
  'network',
  'disconnected',
  'invalid_output',
  'provider',
]);
const KEY_ERRORS = new Set<ErrorCode>(['no_key', 'unauthorized']);

const COPIED_MS = 2000;
const SETTLE_MS = 400;

export interface CardProps {
  state: CardState;
  // Absent when the selection was refused.
  view?: View;
  // Null is Auto.
  choice: string | null;
  onSelect: (preset: PresetId) => void;
  onLanguage: (choice: string | null) => void;
  // Whether the bubble is hidden on this site in this tab.
  bubbleHidden: boolean;
  onBubble: (hidden: boolean) => void;
  onRegenerate: () => void;
  onClose: () => void;
  onOpenOptions: () => void;
  onActivate: (point: Point) => boolean;
}

// The card's own text is English and left to right, whatever the page's language and direction.
export function Card({
  state,
  view,
  choice,
  onSelect,
  onLanguage,
  bubbleHidden,
  onBubble,
  onClose,
  ...body
}: CardProps) {
  return (
    <section class="card" lang="en" dir="ltr" aria-label="Summary">
      <header>
        <span class="title">Dr. Too Long</span>
        <button type="button" class="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {view ? (
        <>
          <Presets selected={view.preset} onSelect={onSelect} />
          <Body state={state} view={view} {...body} />
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

interface PresetsProps {
  selected: PresetId;
  onSelect: CardProps['onSelect'];
}

function Presets({ selected, onSelect }: PresetsProps) {
  return (
    <fieldset class="presets" aria-label="Preset">
      {PRESET_IDS.map((id) => (
        <button key={id} type="button" aria-pressed={id === selected} onClick={() => onSelect(id)}>
          {PRESET_LABELS[id]}
        </button>
      ))}
    </fieldset>
  );
}

interface BodyProps extends Pick<CardProps, 'onRegenerate' | 'onOpenOptions' | 'onActivate'> {
  state: CardState;
  view: View;
}

function Body({ state, view, onRegenerate, onOpenOptions, onActivate }: BodyProps) {
  switch (state.status) {
    case 'error':
      return <Failure state={state} onRegenerate={onRegenerate} onOpenOptions={onOpenOptions} />;
    case 'summarizing':
      return (
        <>
          <Points view={view} points={state.points}>
            {(point) => point.text}
          </Points>
          <p class="status">Summarizing…</p>
        </>
      );
    case 'done':
      return (
        <Summary
          key={viewKey(view)}
          view={view}
          points={state.points}
          onActivate={onActivate}
          onRegenerate={onRegenerate}
        />
      );
  }
}

interface FailureProps extends Pick<CardProps, 'onRegenerate' | 'onOpenOptions'> {
  state: ErrorState;
}

function Failure({ state, onRegenerate, onOpenOptions }: FailureProps) {
  return (
    <>
      <p class="error">{ERROR_MESSAGES[state.code]}</p>
      {state.detail && <p class="detail">{state.detail}</p>}
      <div class="actions">
        {KEY_ERRORS.has(state.code) && (
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
function Points({ view: { preset, language }, points, children }: PointsProps) {
  const text = { lang: language, dir: textDirection(language) };
  if (preset === 'key-points') {
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
          {index > 0 && ' '}
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
}

function Summary({ view, points, onActivate, onRegenerate }: SummaryProps) {
  const [active, setActive] = useState<Active>();
  const activate = (index: number, point: Point) => setActive({ index, found: onActivate(point) });
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
            onClick={() => activate(index, point)}
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
      {active && !active.found && <p class="status">The passage is no longer on the page.</p>}
      <div class="actions">
        <CopyButton text={copyText(view.preset, points)} />
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
  choice: string | null;
  onLanguage: CardProps['onLanguage'];
}

// Keeps its own value, because the card re-renders with the choice it opened with. A closed select
// fires change for each option the arrow keys or type-ahead pass, so only the option the reader
// settles on is run and saved.
function Language({ choice: saved, onLanguage }: LanguageProps) {
  const [choice, setChoice] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: string | null) => {
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

function CopyButton({ text }: { text: string }) {
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
    } catch {
      setLabel('Copy failed');
    }
  };
  return (
    <button type="button" onClick={copy}>
      {label}
    </button>
  );
}
