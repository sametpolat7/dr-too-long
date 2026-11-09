import { DEFAULT_SHAPE, type Point, type SummaryEvent } from '@dr-too-long/shared/contracts';
import { PROVIDERS, type ProviderId } from '@dr-too-long/shared/providers';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ERROR_MESSAGES, httpDetail } from '../error-messages.ts';
import { textDirection } from '../languages.ts';
import { removeApiKey } from '../settings/api-key.ts';
import { readOutputLanguage } from '../settings/output-language.ts';
import { portSummarizer } from '../summarize-port.ts';

const SAMPLE = [
  'The lighthouse keeper logged every ship that passed the cape for forty years.',
  'Historians later used the notebooks to date the decline of the harbor to one winter.',
  'A small museum now keeps them in the room where he wrote.',
];

type Run =
  | { status: 'idle' }
  | { status: 'running' | 'done'; points: Point[]; language: string }
  | { status: 'error'; message: string; detail?: string };

interface SavedKeyProps {
  saved: ProviderId;
  onReplace: () => void;
  onRemove: () => void;
}

export function SavedKey({ saved, onReplace, onRemove }: SavedKeyProps) {
  const { name } = PROVIDERS[saved];
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const running = run.status === 'running';

  // Replace and Remove take this view away, and a test still running ends with it.
  useEffect(() => () => controller.current?.abort(), []);

  async function test() {
    // A second click before the first test has started would otherwise leave that one uncancelable.
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const outputLanguage = await readOutputLanguage();
    setRun({ status: 'running', points: [], language: outputLanguage });
    const request = { shape: DEFAULT_SHAPE, outputLanguage, sentences: SAMPLE };
    for await (const event of portSummarizer.summarize(request, { signal: current.signal })) {
      // A test that was ended must not report on the key.
      if (current.signal.aborted) return;
      setRun(toRun(event, outputLanguage));
    }
  }

  function cancel() {
    controller.current?.abort();
    setRun({ status: 'idle' });
  }

  async function remove() {
    try {
      await removeApiKey();
    } catch {
      setFailed(true);
      return;
    }
    onRemove();
  }

  return (
    <>
      <div class="saved">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="9" fill="currentColor" />
          <path
            d="M5.8 10.3l2.8 2.8 5.6-5.8"
            fill="none"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div>
          <strong id="key-saved">Your {name} key is saved.</strong>
          <p class="note">
            It’s encrypted on this device and goes only to {name}, and only when you ask for a
            summary.
          </p>
        </div>
      </div>
      <div class="actions">
        {/* One button that turns into Cancel, so it keeps the focus and nothing next to it moves. */}
        <button
          type="button"
          id="test-key"
          onClick={running ? cancel : test}
          aria-describedby="key-saved"
        >
          {running ? 'Cancel' : 'Test key'}
        </button>
        <button type="button" id="replace-key" onClick={onReplace}>
          Replace key
        </button>
        <button type="button" class="quiet" onClick={remove}>
          Remove key
        </button>
      </div>
      <Result run={run} />
      {failed && (
        <p class="error" role="alert">
          The key could not be removed. Try again.
        </p>
      )}
    </>
  );
}

// The status stays mounted, so screen readers announce each change to it.
function Result({ run }: { run: Run }) {
  const status = {
    idle: '',
    running: 'Checking your key…',
    done: 'All set: your key works.',
    error: '',
  }[run.status];
  return (
    <>
      {(run.status === 'running' || run.status === 'done') && run.points.length > 0 && (
        <p class="sample" lang={run.language} dir={textDirection(run.language)}>
          {run.points.map((point) => point.text).join(' ')}
        </p>
      )}
      <p class={run.status === 'done' ? 'status good' : 'status'} role="status">
        {status}
      </p>
      {run.status === 'error' && (
        <div role="alert">
          <p class="error">{run.message}</p>
          {run.detail && <p class="note">{run.detail}</p>}
        </div>
      )}
    </>
  );
}

function toRun(event: SummaryEvent, language: string): Run {
  switch (event.type) {
    case 'partial':
      return { status: 'running', points: event.points, language };
    case 'done':
      return { status: 'done', points: event.output.points, language };
    case 'error':
      return {
        status: 'error',
        message: ERROR_MESSAGES[event.code],
        detail: httpDetail(event.httpStatus),
      };
  }
}
