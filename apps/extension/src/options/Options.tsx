import type { ProviderId } from '@dr-too-long/shared/providers';
import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { LINKS } from '../links.ts';
import { readKeyProvider } from '../settings/api-key.ts';
import { KeyForm } from './KeyForm.tsx';
import { SavedKey } from './SavedKey.tsx';

// Opens in Chrome's options dialog, whose title already shows the extension's name and icon.
export function Options() {
  // Undefined until the saved key's provider has loaded, so the page never flashes another state.
  const [saved, setSaved] = useState<ProviderId | null>();
  const [replacing, setReplacing] = useState(false);
  // Save, Replace, Cancel and Remove take away the button that was pressed, so the focus moves to
  // this control of the next view once it has rendered.
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    readKeyProvider().then(setSaved);
  }, []);

  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  function show(next: { saved: ProviderId | null; replacing: boolean; focus: string }) {
    setSaved(next.saved);
    setReplacing(next.replacing);
    focusNext.current = next.focus;
  }

  if (saved === undefined) return null;

  return (
    <main>
      <h1>{!saved ? 'Add your API key' : replacing ? 'Replace your API key' : 'Your API key'}</h1>
      {saved && !replacing ? (
        <SavedKey
          saved={saved}
          onReplace={() => show({ saved, replacing: true, focus: 'api-key' })}
          onRemove={() => show({ saved: null, replacing: false, focus: 'api-key' })}
        />
      ) : (
        <KeyForm
          saved={saved}
          onSave={(provider) => show({ saved: provider, replacing: false, focus: 'test-key' })}
          onCancel={
            replacing ? () => show({ saved, replacing: false, focus: 'replace-key' }) : undefined
          }
        />
      )}
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
