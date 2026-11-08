import { DEFAULT_SHAPE, type Point, type SummaryEvent } from '@dr-too-long/shared/contracts';
import type { ProviderId } from '@dr-too-long/shared/providers';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ERROR_MESSAGES, httpDetail } from '../error-messages.ts';
import { readKeyProvider } from '../settings/api-key.ts';
import { readOutputLanguage } from '../settings/output-language.ts';
import { portSummarizer } from '../summarize-port.ts';
import { EverySite } from './EverySite.tsx';
import { KeyForm } from './KeyForm.tsx';
import { OutputLanguage } from './OutputLanguage.tsx';

const SAMPLE = [
  'The lighthouse keeper logged every ship that passed the cape for forty years.',
  'Historians later used the notebooks to date the decline of the harbour to one winter.',
  'A small museum now keeps them in the room where he wrote.',
];

type Run =
  | { status: 'idle' }
  | { status: 'running'; points: Point[] }
  | { status: 'done'; points: Point[] }
  | { status: 'error'; message: string; detail?: string };

export function Options() {
  // Undefined until the saved key's provider has loaded, so the form never flashes another one.
  const [saved, setSaved] = useState<ProviderId | null>();
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    readKeyProvider().then(setSaved);
  }, []);

  function keyChanged(provider: ProviderId | null) {
    controller.current?.abort();
    controller.current = null;
    setSaved(provider);
    setRun({ status: 'idle' });
  }

  async function test() {
    const current = new AbortController();
    controller.current = current;
    setRun({ status: 'running', points: [] });
    const outputLanguage = await readOutputLanguage();
    const request = { shape: DEFAULT_SHAPE, outputLanguage, sentences: SAMPLE };
    for await (const event of portSummarizer.summarize(request, { signal: current.signal })) {
      // A run that a key change ended must not report on the new key.
      if (controller.current !== current) return;
      setRun(toRun(event));
    }
  }

  return (
    <main>
      <h1>Dr. Too Long</h1>
      {saved !== undefined && <KeyForm saved={saved} onChange={keyChanged} />}
      <OutputLanguage />
      <EverySite />
      <div class="actions">
        <button type="button" onClick={test} disabled={!saved || run.status === 'running'}>
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
      return (
        <>
          <p class="error">{run.message}</p>
          {run.detail && <p class="status">{run.detail}</p>}
        </>
      );
    default:
      return (
        <>
          <ol>
            {run.points.map((point) => (
              <li key={point.text}>{point.text}</li>
            ))}
          </ol>
          <p class="status">{run.status === 'done' ? 'The key works.' : 'Summarizing…'}</p>
        </>
      );
  }
}

function toRun(event: SummaryEvent): Run {
  switch (event.type) {
    case 'partial':
      return { status: 'running', points: event.points };
    case 'done':
      return { status: 'done', points: event.output.points };
    case 'error':
      return {
        status: 'error',
        message: ERROR_MESSAGES[event.code],
        detail: httpDetail(event.httpStatus),
      };
  }
}
