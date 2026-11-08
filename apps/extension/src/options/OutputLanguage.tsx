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

  useEffect(() => {
    readLanguageChoice().then(setChoice);
    return watchLanguageChoice(setChoice);
  }, []);

  if (choice === undefined) return null;

  async function change(next: LanguageChoice) {
    await writeLanguageChoice(next);
    setChoice(next);
  }

  return <LanguageSelect choice={choice} onChange={change} />;
}
