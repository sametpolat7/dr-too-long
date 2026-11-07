import {
  isProviderId,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
} from '@dr-too-long/shared/providers';
import { useState } from 'preact/hooks';
import { removeApiKey, writeApiKey } from '../settings/api-key.ts';

interface KeyFormProps {
  // Null when no key is saved.
  saved: ProviderId | null;
  onChange: (saved: ProviderId | null) => void;
}

const PROVIDER_NAMES = new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(
  PROVIDER_IDS.map((id) => PROVIDERS[id].name),
);

export function KeyForm({ saved, onChange }: KeyFormProps) {
  const [picked, setPicked] = useState<ProviderId>(saved ?? PROVIDER_IDS[0]);
  const [draft, setDraft] = useState('');
  const { name } = PROVIDERS[picked];

  async function save(event: Event) {
    event.preventDefault();
    await writeApiKey({ provider: picked, key: draft });
    setDraft('');
    onChange(picked);
  }

  async function remove() {
    await removeApiKey();
    onChange(null);
  }

  return (
    <>
      <p class="status">
        {saved
          ? `The ${PROVIDERS[saved].name} API key is saved on this device.`
          : `No API key is saved. Summaries need your own ${PROVIDER_NAMES} API key.`}
      </p>
      <form onSubmit={save}>
        <select
          aria-label="Provider"
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
        <input
          type="password"
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder={
            picked === saved ? `Replace the saved ${name} key` : `Paste your ${name} API key`
          }
          aria-label={`${name} API key`}
          autocomplete="off"
        />
        <button type="submit" disabled={draft.trim() === ''}>
          Save
        </button>
        {saved && (
          <button type="button" onClick={remove}>
            Remove key
          </button>
        )}
      </form>
      <p class="note">
        {`A summary sends the text you select to the ${name} API with this key, under your account.`}
        {picked === 'google' &&
          ' With a free-tier key, Google may use that text to improve its products, and people may read it.'}
      </p>
    </>
  );
}
