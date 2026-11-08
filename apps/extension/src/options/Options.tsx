import { DEFAULT_SHAPE, type Point, type SummaryEvent } from '@dr-too-long/shared/contracts';
import type { ProviderId } from '@dr-too-long/shared/providers';
import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { ERROR_MESSAGES, httpDetail } from '../error-messages.ts';
import { textDirection } from '../languages.ts';
import { LINKS } from '../links.ts';
import { readKeyProvider } from '../settings/api-key.ts';
import { readOutputLanguage } from '../settings/output-language.ts';
import { portSummarizer } from '../summarize-port.ts';
import { EverySite } from './EverySite.tsx';
import { KeyForm } from './KeyForm.tsx';
import { OutputLanguage } from './OutputLanguage.tsx';

const SAMPLE = [
  'The lighthouse keeper logged every ship that passed the cape for forty years.',
  'Historians later used the notebooks to date the decline of the harbor to one winter.',
  'A small museum now keeps them in the room where he wrote.',
];

type Run =
  | { status: 'idle' }
  | { status: 'running' | 'done'; points: Point[]; language: string }
  | { status: 'error'; message: string; detail?: string };

// Opens in Chrome's options dialog, whose title already shows the extension's name and icon.
export function Options() {
  // Undefined until the saved key's provider has loaded, so the form never flashes another one.
  const [saved, setSaved] = useState<ProviderId | null>();
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    readKeyProvider().then(setSaved);
  }, []);

  function stopTest() {
    controller.current?.abort();
    controller.current = null;
    setRun({ status: 'idle' });
  }

  function keyChanged(provider: ProviderId | null) {
    stopTest();
    setSaved(provider);
  }

  async function test() {
    const current = new AbortController();
    controller.current = current;
    const outputLanguage = await readOutputLanguage();
    setRun({ status: 'running', points: [], language: outputLanguage });
    const request = { shape: DEFAULT_SHAPE, outputLanguage, sentences: SAMPLE };
    for await (const event of portSummarizer.summarize(request, { signal: current.signal })) {
      // A run that Cancel or a key change ended must not report on the key.
      if (controller.current !== current) return;
      setRun(toRun(event, outputLanguage));
    }
  }

  return (
    <main>
      <p class="intro">
        Dr. Too Long summarizes the text you select, in your language, with every point linked to
        the sentences it comes from. It runs on your own API key, with no server in between.
      </p>
      <section aria-labelledby="key-heading">
        <h2 id="key-heading">API key</h2>
        {saved !== undefined && (
          <KeyForm saved={saved} onChange={keyChanged}>
            <button type="button" onClick={test} disabled={!saved || run.status === 'running'}>
              Test key
            </button>
            {run.status === 'running' && (
              <button type="button" onClick={stopTest}>
                Cancel
              </button>
            )}
          </KeyForm>
        )}
        <Result run={run} />
      </section>
      <section aria-labelledby="summaries-heading">
        <h2 id="summaries-heading">Summaries</h2>
        <OutputLanguage />
      </section>
      <section aria-labelledby="bubble-heading">
        <h2 id="bubble-heading">Bubble</h2>
        <EverySite />
      </section>
      <footer>
        <span>Version {browser.runtime.getManifest().version}</span>
        <a href={LINKS.privacy} target="_blank" rel="noreferrer">
          Privacy policy
        </a>
        <a href={LINKS.repository} target="_blank" rel="noreferrer">
          Source code
        </a>
        <a href={LINKS.issues} target="_blank" rel="noreferrer">
          Report a problem
        </a>
      </footer>
    </main>
  );
}

// The status stays mounted, so screen readers announce each change to it.
function Result({ run }: { run: Run }) {
  const status = { idle: '', running: 'Testing the key…', done: 'The key works.', error: '' }[
    run.status
  ];
  return (
    <>
      {(run.status === 'running' || run.status === 'done') && run.points.length > 0 && (
        <p class="sample" lang={run.language} dir={textDirection(run.language)}>
          {run.points.map((point) => point.text).join(' ')}
        </p>
      )}
      <p class="status" role="status">
        {status}
      </p>
      {run.status === 'error' && (
        <div role="alert">
          <p class="error">{run.message}</p>
          {run.detail && <p class="status">{run.detail}</p>}
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
