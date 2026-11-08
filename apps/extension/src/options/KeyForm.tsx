import {
  isProviderId,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
  providerOfKey,
} from '@dr-too-long/shared/providers';
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { LINKS } from '../links.ts';
import { isWellFormedKey, removeApiKey, writeApiKey } from '../settings/api-key.ts';

interface KeyFormProps {
  // Null when no key is saved.
  saved: ProviderId | null;
  onChange: (saved: ProviderId | null) => void;
  // More buttons for the same row, such as Test key.
  children?: ComponentChildren;
}

// "OpenAI, Claude or Gemini", without the serial comma, as in the rest of the text.
const PROVIDER_NAMES = new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(
  PROVIDER_IDS.map((id) => PROVIDERS[id].name),
);

export function KeyForm({ saved, onChange, children }: KeyFormProps) {
  const [picked, setPicked] = useState<ProviderId>(saved ?? PROVIDER_IDS[0]);
  const [draft, setDraft] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [failure, setFailure] = useState<string>();
  const keyField = useRef<HTMLInputElement>(null);
  const { name, keysUrl } = PROVIDERS[picked];

  function refusal(): string | undefined {
    if (!isWellFormedKey(draft)) {
      return 'The key holds a character no API key has, such as an invisible space. Copy it again from your provider.';
    }
    const owner = providerOfKey(draft.trim());
    if (owner && owner !== picked) {
      return `This looks like a ${PROVIDERS[owner].name} key. Pick ${PROVIDERS[owner].name} as the provider, or paste your ${name} key.`;
    }
  }

  async function save(event: Event) {
    event.preventDefault();
    const refused = refusal();
    if (refused) {
      setFailure(refused);
      return;
    }
    try {
      await writeApiKey({ provider: picked, key: draft });
    } catch {
      setFailure('The key could not be saved on this device. Try again.');
      return;
    }
    setFailure(undefined);
    setDraft('');
    setAgreed(false);
    onChange(picked);
    keyField.current?.focus();
  }

  async function remove() {
    try {
      await removeApiKey();
    } catch {
      setFailure('The key could not be removed. Try again.');
      return;
    }
    setFailure(undefined);
    onChange(null);
    // The Remove button goes with the key, so focus moves to where a new one is pasted.
    keyField.current?.focus();
  }

  return (
    <>
      <p class="status" role="status">
        {saved
          ? `Your ${PROVIDERS[saved].name} API key is saved on this device.`
          : `No API key is saved yet. Summaries need your own ${PROVIDER_NAMES} API key.`}
      </p>
      <form onSubmit={save}>
        <label for="provider">Provider</label>
        <select
          id="provider"
          name="provider"
          value={picked}
          onChange={(event) => {
            const { value } = event.currentTarget;
            if (isProviderId(value)) setPicked(value);
          }}
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {PROVIDERS[id].name}
            </option>
          ))}
        </select>
        <label for="api-key">{name} API key</label>
        <input
          ref={keyField}
          id="api-key"
          name="api-key"
          type="password"
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          autocomplete="off"
          spellcheck={false}
        />
        <p class="note">
          <a href={keysUrl} target="_blank" rel="noreferrer">
            Get an API key from {name}
          </a>
          . Use a key made for Dr. Too Long, with a monthly spending limit.
          {picked === 'google' &&
            ' With an unpaid Gemini key, Google may use the text you send to improve its products, and human reviewers may read it.'}
        </p>
        {saved && saved !== picked && (
          <p class="note">Saving replaces your saved {PROVIDERS[saved].name} key.</p>
        )}
        <label class="agree">
          <input
            type="checkbox"
            name="agree"
            checked={agreed}
            onChange={(event) => setAgreed(event.currentTarget.checked)}
          />
          <span>
            I understand that each summary sends the text I select, with this key, to {name}, and
            that nothing else leaves my browser, as the{' '}
            <a href={LINKS.privacy} target="_blank" rel="noreferrer">
              privacy policy
            </a>{' '}
            explains.
          </span>
        </label>
        <div class="actions">
          <button type="submit" disabled={draft.trim() === '' || !agreed}>
            Save key
          </button>
          {saved && (
            <button type="button" onClick={remove}>
              Remove {PROVIDERS[saved].name} key
            </button>
          )}
          {children}
        </div>
      </form>
      {failure && (
        <p class="error" role="alert">
          {failure}
        </p>
      )}
    </>
  );
}
