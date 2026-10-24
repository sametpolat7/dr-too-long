import type { ErrorCode, Point, SummaryEvent } from '@dr-too-long/shared/contracts';
import { ACTIVE_MODEL } from '@dr-too-long/shared/providers';
import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { readApiKey, removeApiKey, writeApiKey } from '../settings/api-key.ts';
import { portSummarizer } from '../summarize-port.ts';

const SAMPLE = [
  'The lighthouse keeper logged every ship that passed the cape for forty years.',
  'Historians later used the notebooks to date the decline of the harbour to one winter.',
  'A small museum now keeps them in the room where he wrote.',
];

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  no_key: 'Save an API key first.',
  unauthorized: 'The provider rejected the API key.',
  rate_limited: 'The provider is rate limiting this key. Try again in a moment.',
  network: 'The provider could not be reached.',
  aborted: 'The run was cancelled.',
  disconnected: 'The background worker stopped before the summary finished.',
  invalid_output: 'The model returned no usable summary.',
  too_long: 'The selection is too long.',
  unsupported_selection: 'This selection cannot be summarized.',
  provider: 'The provider returned an error.',
};

type Run =
  | { status: 'idle' }
  | { status: 'running'; points: Point[] }
  | { status: 'done'; points: Point[]; detail: string }
  | { status: 'error'; message: string };

export function Options() {
  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState('');
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    readApiKey().then((key) => setHasKey(key !== null));
  }, []);

  async function save(event: Event) {
    event.preventDefault();
    await writeApiKey(draft);
    setDraft('');
    setHasKey(true);
  }

  async function remove() {
    await removeApiKey();
    setHasKey(false);
    setRun({ status: 'idle' });
  }

  async function test() {
    const current = new AbortController();
    controller.current = current;
    setRun({ status: 'running', points: [] });
    const request = {
      v: 1 as const,
      preset: 'summary' as const,
      outputLanguage: browser.i18n.getUILanguage(),
      sentences: SAMPLE,
    };
    for await (const event of portSummarizer.summarize(request, { signal: current.signal })) {
      setRun(toRun(event));
    }
  }

  return (
    <main>
      <h1>Dr. Too Long</h1>
      <p class="status">
        {hasKey
          ? 'An OpenAI API key is saved on this device.'
          : 'No API key is saved. Summaries need your own OpenAI API key.'}
      </p>
      <form onSubmit={save}>
        <input
          type="password"
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder={hasKey ? 'Replace the saved key' : 'Paste your OpenAI API key'}
          aria-label="OpenAI API key"
          autocomplete="off"
        />
        <button type="submit" disabled={draft.trim() === ''}>
          Save
        </button>
        {hasKey && (
          <button type="button" onClick={remove}>
            Remove key
          </button>
        )}
      </form>
      <div class="actions">
        <button type="button" onClick={test} disabled={!hasKey || run.status === 'running'}>
          Test key
        </button>
        {run.status === 'running' && (
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        )}
      </div>
      <Result run={run} />
    </main>
  );
}

function Result({ run }: { run: Run }) {
  switch (run.status) {
    case 'idle':
      return null;
    case 'error':
      return <p class="error">{run.message}</p>;
    default:
      return (
        <>
          <ol>
            {run.points.map((point) => (
              <li key={point.text}>{point.text}</li>
            ))}
          </ol>
          <p class="status">{run.status === 'done' ? run.detail : 'Summarizing…'}</p>
        </>
      );
  }
}

function toRun(event: SummaryEvent): Run {
  switch (event.type) {
    case 'partial':
      return { status: 'running', points: event.points };
    case 'done':
      return { status: 'done', points: event.output.points, detail: describe(event) };
    case 'error':
      return { status: 'error', message: ERROR_MESSAGES[event.code] };
  }
}

function describe({ usage, latencyMs, dropped }: Extract<SummaryEvent, { type: 'done' }>): string {
  const tokens = usage ? `${usage.inputTokens} in, ${usage.outputTokens} out` : 'no token count';
  return `${ACTIVE_MODEL.modelId} · ${tokens} · ${latencyMs} ms · ${dropped} dropped`;
}
