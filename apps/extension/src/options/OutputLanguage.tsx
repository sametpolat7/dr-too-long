import { useEffect, useState } from 'preact/hooks';
import { LanguageSelect } from '../LanguageSelect.tsx';
import type { LanguageChoice } from '../languages.ts';
import {
  readLanguageChoice,
  watchLanguageChoice,
  writeLanguageChoice,
} from '../settings/output-language.ts';

export function OutputLanguage() {
  // Undefined until the saved choice has loaded, so the select never flashes Auto.
  const [choice, setChoice] = useState<LanguageChoice>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readLanguageChoice().then(setChoice);
    return watchLanguageChoice(setChoice);
  }, []);

  if (choice === undefined) return null;

  async function change(next: LanguageChoice) {
    try {
      await writeLanguageChoice(next);
      setChoice(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <LanguageSelect choice={choice} onChange={change} />
      {failed && (
        <p class="error" role="alert">
          The summary language could not be saved. Try again.
        </p>
      )}
    </>
  );
}
