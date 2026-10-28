import type { ErrorCode, Point } from '@dr-too-long/shared/contracts';
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { ERROR_MESSAGES } from '../../error-messages.ts';

export type CardState =
  | { status: 'summarizing'; points: Point[] }
  | { status: 'done'; points: Point[] }
  | { status: 'error'; code: ErrorCode; detail?: string };

interface CardProps {
  state: CardState;
  onClose: () => void;
  onOpenOptions: () => void;
  onActivate: (point: Point) => boolean;
}

export function Card({ state, onClose, onOpenOptions, onActivate }: CardProps) {
  return (
    <section class="card" aria-label="Summary">
      <header>
        <span class="title">Dr. Too Long</span>
        <button type="button" class="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <Body state={state} onOpenOptions={onOpenOptions} onActivate={onActivate} />
    </section>
  );
}

function Body({ state, onOpenOptions, onActivate }: Omit<CardProps, 'onClose'>) {
  if (state.status === 'error') {
    return (
      <>
        <p class="error">{ERROR_MESSAGES[state.code]}</p>
        {state.detail && <p class="detail">{state.detail}</p>}
        {state.code === 'no_key' && (
          <button type="button" class="options" onClick={onOpenOptions}>
            Open options
          </button>
        )}
      </>
    );
  }
  if (state.status === 'summarizing') {
    return (
      <>
        <p>{state.points.map((point) => point.text).join(' ')}</p>
        <p class="status">Summarizing…</p>
      </>
    );
  }
  return <Summary points={state.points} onActivate={onActivate} />;
}

interface Active {
  index: number;
  found: boolean;
}

interface SummaryProps {
  points: Point[];
  onActivate: CardProps['onActivate'];
}

function Summary({ points, onActivate }: SummaryProps) {
  const [active, setActive] = useState<Active>();
  const activate = (index: number, point: Point) => setActive({ index, found: onActivate(point) });
  return (
    <>
      <p>
        {points.map((point, index) => (
          <Fragment key={point.text}>
            {index > 0 && ' '}
            {/* biome-ignore lint/a11y/useSemanticElements: a button box cannot wrap across lines, so the points would stack. */}
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
          </Fragment>
        ))}
      </p>
      {active && !active.found && <p class="status">The passage is no longer on the page.</p>}
    </>
  );
}

function pointClass(active: Active | undefined, index: number): string {
  if (active?.index !== index) return 'point';
  return active.found ? 'point active' : 'point missing';
}
