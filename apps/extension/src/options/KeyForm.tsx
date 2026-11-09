import {
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
  providerOfKey,
} from '@dr-too-long/shared/providers';
import { useState } from 'preact/hooks';
import { LINKS } from '../links.ts';
import { isWellFormedKey, writeApiKey } from '../settings/api-key.ts';

interface KeyFormProps {
  // Null when no key is saved.
  saved: ProviderId | null;
  onSave: (provider: ProviderId) => void;
  // Given while a saved key is being replaced.
  onCancel?: () => void;
}

// "an OpenAI", "a Claude", "a Gemini".
const withArticle = (name: string) => `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;

export function KeyForm({ saved, onSave, onCancel }: KeyFormProps) {
  const [picked, setPicked] = useState<ProviderId>(saved ?? PROVIDER_IDS[0]);
  const [draft, setDraft] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [failure, setFailure] = useState<string>();
  const { name, keysUrl } = PROVIDERS[picked];

  function refusal(): string | undefined {
    if (!isWellFormedKey(draft)) {
      return 'The key holds a character no API key has, such as an invisible space. Copy it again from your provider.';
    }
    const owner = providerOfKey(draft.trim());
    if (owner && owner !== picked) {
      return `This looks like ${withArticle(PROVIDERS[owner].name)} key. Pick ${PROVIDERS[owner].name} as the provider, or paste your ${name} key.`;
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
    onSave(picked);
  }

  return (
    <>
      <p class="lead">
        Dr. Too Long runs on your own API key, so you stay in control. The key is encrypted on this
        device and is only ever sent to the provider you choose.
      </p>
      <form onSubmit={save}>
        <div class="fields">
          <span id="provider-label" class="label">
            Provider
          </span>
          <div class="segments" role="radiogroup" aria-labelledby="provider-label">
            {PROVIDER_IDS.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name="provider"
                  value={id}
                  checked={id === picked}
                  // The agreement and any refusal name the provider they were given for.
                  onChange={() => {
                    setPicked(id);
                    setAgreed(false);
                    setFailure(undefined);
                  }}
                />
                {PROVIDERS[id].name}
              </label>
            ))}
          </div>
          <label for="api-key" class="label">
            {name} API key
          </label>
          <input
            id="api-key"
            name="api-key"
            type="password"
            value={draft}
            onInput={(event) => setDraft(event.currentTarget.value)}
            placeholder="Paste your key here"
            autocomplete="off"
            spellcheck={false}
          />
          <p class="note">
            No key yet?{' '}
            <a href={keysUrl} target="_blank" rel="noreferrer">
              Get {withArticle(name)} API key
            </a>
            . A key made just for Dr. Too Long, with a monthly spending limit, keeps your costs
            predictable.
            {picked === 'google' &&
              ' Good to know: with an unpaid Gemini key, Google may use the text you send to improve its products, and people may review it.'}
          </p>
          {saved && saved !== picked && (
            <p class="note">Saving replaces your saved {PROVIDERS[saved].name} key.</p>
          )}
        </div>
        <label class="agree">
          <input
            type="checkbox"
            name="agree"
            checked={agreed}
            onChange={(event) => setAgreed(event.currentTarget.checked)}
          />
          <span>
            I understand that each summary sends the text I select, with this key, to {name}.
            Nothing else from the page leaves my browser, as the{' '}
            <a href={LINKS.privacy} target="_blank" rel="noreferrer">
              privacy policy
            </a>{' '}
            explains.
          </span>
        </label>
        <div class="actions">
          <button type="submit" class="primary" disabled={draft.trim() === '' || !agreed}>
            Save key
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
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
