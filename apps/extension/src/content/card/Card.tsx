import type { ErrorCode, Point } from '@dr-too-long/shared/contracts';
import { ERROR_MESSAGES } from '../../error-messages.ts';

export type CardState =
  | { status: 'summarizing'; points: Point[] }
  | { status: 'done'; points: Point[] }
  | { status: 'error'; code: ErrorCode; detail?: string };

interface CardProps {
  state: CardState;
  onClose: () => void;
  onOpenOptions: () => void;
}

export function Card({ state, onClose, onOpenOptions }: CardProps) {
  return (
    <section class="card" aria-label="Summary">
      <header>
        <span class="title">Dr. Too Long</span>
        <button type="button" class="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <Body state={state} onOpenOptions={onOpenOptions} />
    </section>
  );
}

function Body({ state, onOpenOptions }: Omit<CardProps, 'onClose'>) {
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
  return (
    <>
      <p>{state.points.map((point) => point.text).join(' ')}</p>
      {state.status === 'summarizing' && <p class="status">Summarizing…</p>}
    </>
  );
}
