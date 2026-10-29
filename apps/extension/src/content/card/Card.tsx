import {
  DEFAULT_PRESET,
  type ErrorCode,
  type Point,
  PRESET_IDS,
  type PresetId,
} from '@dr-too-long/shared/contracts';
import { type ComponentChild, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ERROR_MESSAGES } from '../../error-messages.ts';
import { copyText } from './copy.ts';

export type CardState =
  | { status: 'summarizing'; points: Point[] }
  | { status: 'done'; points: Point[]; dropped: number }
  | { status: 'error'; code: ErrorCode; detail?: string };

const PRESET_LABELS: Record<PresetId, string> = {
  'single-sentence': 'Single sentence',
  summary: 'Summary',
  'bulleted-list': 'Bulleted list',
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

interface CardProps {
  state: CardState;
  // Absent when the selection was refused, so no preset can run.
  preset?: PresetId;
  onSelect: (preset: PresetId) => void;
  onRegenerate: () => void;
  onClose: () => void;
  onOpenOptions: () => void;
  onActivate: (point: Point) => boolean;
}

export function Card({ preset, onSelect, onClose, ...body }: CardProps) {
  return (
    <section class="card" aria-label="Summary">
      <header>
        <span class="title">Dr. Too Long</span>
        <button type="button" class="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {preset && <Presets selected={preset} onSelect={onSelect} />}
      <Body preset={preset ?? DEFAULT_PRESET} {...body} />
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

type BodyProps = Omit<CardProps, 'onSelect' | 'onClose'> & { preset: PresetId };

function Body({ state, preset, onRegenerate, onOpenOptions, onActivate }: BodyProps) {
  switch (state.status) {
    case 'error':
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
    case 'summarizing':
      return (
        <>
          <Points preset={preset} points={state.points}>
            {(point) => point.text}
          </Points>
          <p class="status">Summarizing…</p>
        </>
      );
    case 'done':
      return (
        <Summary
          key={preset}
          preset={preset}
          points={state.points}
          dropped={state.dropped}
          onActivate={onActivate}
          onRegenerate={onRegenerate}
        />
      );
  }
}

interface PointsProps {
  preset: PresetId;
  points: Point[];
  children: (point: Point, index: number) => ComponentChild;
}

// Bullets for the list, one paragraph otherwise. dir="auto" lays out right-to-left languages.
function Points({ preset, points, children }: PointsProps) {
  if (preset === 'bulleted-list') {
    return (
      <ul dir="auto">
        {points.map((point, index) => (
          <li key={index}>{children(point, index)}</li>
        ))}
      </ul>
    );
  }
  return (
    <p dir="auto">
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
  preset: PresetId;
  points: Point[];
  dropped: number;
  onActivate: CardProps['onActivate'];
  onRegenerate: CardProps['onRegenerate'];
}

function Summary({ preset, points, dropped, onActivate, onRegenerate }: SummaryProps) {
  const [active, setActive] = useState<Active>();
  const activate = (index: number, point: Point) => setActive({ index, found: onActivate(point) });
  return (
    <>
      <Points preset={preset} points={points}>
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
      {dropped > 0 && <p class="status">{droppedNote(dropped)}</p>}
      <div class="actions">
        <CopyButton text={copyText(preset, points)} />
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

function droppedNote(dropped: number): string {
  return dropped === 1
    ? '1 point from the model was left out.'
    : `${dropped} points from the model were left out.`;
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
