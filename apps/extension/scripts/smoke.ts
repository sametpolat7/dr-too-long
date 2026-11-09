// The script talks to Chrome over the DevTools protocol pipe, so it needs no dependency and no
// browser download: it uses the Chrome already installed (CHROME_PATH overrides where).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const EXTENSION_DIR = new URL('../.output/chrome-mv3', import.meta.url).pathname;
const TIMEOUT_MS = 30_000;
// Long enough for the worker's and the pages' first tasks to settle.
const SETTLE_MS = 2_000;
// With no key saved in the new profile, the popup asks for one.
const PAGES = { 'options.html': 'options page', 'popup.html': 'popup' };

interface Message {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
}

interface Target {
  type: string;
  url: string;
}

interface Events {
  'Target.attachedToTarget': { sessionId: string; targetInfo: Target };
  'Runtime.exceptionThrown': {
    exceptionDetails: { text: string; exception?: { description?: string } };
  };
  'Runtime.consoleAPICalled': { type: string; args: { description?: string; value?: unknown }[] };
  'Log.entryAdded': { entry: { level: string; text: string } };
  'Audits.issueAdded': { issue: { code: string; details: Record<string, unknown> } };
}

class Cdp {
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  #listeners = new Set<(message: Message) => void>();
  #input: Writable;
  #buffer = '';

  constructor(input: Writable, output: Readable) {
    this.#input = input;
    output.setEncoding('utf8');
    output.on('data', (chunk: string) => {
      this.#buffer += chunk;
      for (let end = this.#buffer.indexOf('\0'); end !== -1; end = this.#buffer.indexOf('\0')) {
        this.#dispatch(JSON.parse(this.#buffer.slice(0, end)));
        this.#buffer = this.#buffer.slice(end + 1);
      }
    });
    output.on('close', () => {
      for (const { reject } of this.#pending.values()) reject(new Error('Chrome exited.'));
      this.#pending.clear();
    });
  }

  send<T = unknown>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = this.#nextId++;
    this.#input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    return new Promise((resolve, reject) =>
      this.#pending.set(id, { resolve: (result) => resolve(result as T), reject }),
    );
  }

  on<K extends keyof Events>(method: K, listener: (params: Events[K], sessionId?: string) => void) {
    this.#listeners.add((message) => {
      if (message.method === method) listener(message.params as Events[K], message.sessionId);
    });
  }

  #dispatch(message: Message): void {
    const pending = message.id === undefined ? undefined : this.#pending.get(message.id);
    if (pending && message.id !== undefined) {
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.#listeners) listener(message);
  }
}

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return 'google-chrome';
}

async function smoke(): Promise<string[]> {
  const profile = mkdtempSync(join(tmpdir(), 'dr-too-long-smoke-'));
  const chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  const deadline = setTimeout(() => chrome.kill(), TIMEOUT_MS);
  const cdp = new Cdp(chrome.stdio[3] as Writable, chrome.stdio[4] as Readable);
  const targets = new Map<string, Target>();
  const problems: { url: string; text: string }[] = [];
  const report = (sessionId: string | undefined, text: string) => {
    const target = sessionId && targets.get(sessionId);
    if (target) problems.push({ url: target.url, text });
  };

  // Every target pauses until the listeners below are on, so nothing its start logs is missed.
  cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
    targets.set(sessionId, targetInfo);
    const domains = targetInfo.url.startsWith('chrome-extension://')
      ? ['Runtime', 'Log', 'Audits']
      : [];
    void Promise.all(domains.map((domain) => cdp.send(`${domain}.enable`, {}, sessionId))).then(
      () => cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId),
    );
  });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }, sessionId) =>
    report(sessionId, exceptionDetails.exception?.description ?? exceptionDetails.text),
  );
  cdp.on('Runtime.consoleAPICalled', ({ type, args }, sessionId) => {
    const text = args.map((arg) => arg.description ?? String(arg.value)).join(' ');
    if (type === 'error' || type === 'assert') report(sessionId, `console.${type}: ${text}`);
  });
  cdp.on('Log.entryAdded', ({ entry }, sessionId) => {
    if (entry.level === 'error') report(sessionId, entry.text);
  });
  // A refused eval, among other policy breaches, is reported only as an issue.
  cdp.on('Audits.issueAdded', ({ issue }, sessionId) =>
    report(sessionId, `${issue.code}: ${JSON.stringify(Object.values(issue.details)[0])}`),
  );

  const errors: string[] = [];
  try {
    await cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
    const { id } = await cdp.send<{ id: string }>('Extensions.loadUnpacked', {
      path: EXTENSION_DIR,
    });
    const origin = `chrome-extension://${id}/`;
    for (const page of Object.keys(PAGES)) {
      await cdp.send('Target.createTarget', { url: `${origin}${page}` });
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const ours = [...targets].filter(([, target]) => target.url.startsWith(origin));
    if (!ours.some(([, target]) => target.type === 'service_worker')) {
      errors.push('The service worker never started.');
    }
    for (const [page, name] of Object.entries(PAGES)) {
      const session = ours.find(([, target]) => target.url === `${origin}${page}`)?.[0];
      const rendered =
        session === undefined
          ? undefined
          : await cdp.send<{ result: { value: unknown } }>(
              'Runtime.evaluate',
              { expression: 'document.body.textContent.trim().length > 0', returnByValue: true },
              session,
            );
      if (rendered?.result.value !== true) errors.push(`The ${name} rendered nothing.`);
    }
    const lines = problems
      .filter(({ url }) => url.startsWith(origin))
      .map(({ url, text }) => `${url.slice(origin.length)}: ${text}`);
    errors.push(...new Set(lines));
    await cdp.send('Browser.close');
  } finally {
    clearTimeout(deadline);
    chrome.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true });
  }
  return errors;
}

const errors = await smoke().catch((error: Error) => [error.message]);
if (errors.length > 0) {
  console.error('The built extension failed its smoke test:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.info('The built extension loads with no worker, options page or popup error.');
