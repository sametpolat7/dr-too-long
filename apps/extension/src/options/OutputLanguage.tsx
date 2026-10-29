import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { readLanguageChoice, writeLanguageChoice } from '../settings/output-language.ts';
import { LANGUAGES, languageLabel } from './languages.ts';

// The select's value for Auto, which the settings store as no choice at all.
const AUTO = '';

export function OutputLanguage() {
  // Undefined until the saved choice has loaded, so the select never flashes Auto.
  const [choice, setChoice] = useState<string | null>();

  useEffect(() => {
    readLanguageChoice().then(setChoice);
  }, []);

  if (choice === undefined) return null;

  async function change(value: string) {
    const tag = value === AUTO ? null : value;
    await writeLanguageChoice(tag);
    setChoice(tag);
  }

  return (
    <label class="language">
      Summary language
      <select value={choice ?? AUTO} onChange={(event) => change(event.currentTarget.value)}>
        <option value={AUTO}>
          Auto: Chrome's language ({languageLabel(browser.i18n.getUILanguage())})
        </option>
        {LANGUAGES.map(({ tag, label }) => (
          <option key={tag} value={tag}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
