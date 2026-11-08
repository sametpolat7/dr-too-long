import { browser } from 'wxt/browser';
import { LANGUAGE_TAGS, type LanguageChoice } from './languages.ts';

const AUTO = '';

const DISPLAY = { type: 'language', languageDisplay: 'standard' } as const;
const inEnglish = new Intl.DisplayNames(['en'], DISPLAY);

// English name first, for an English page. Standard names put a qualifier after the language, so
// Chinese (Simplified) sorts beside Chinese (Traditional).
function languageLabel(tag: string): string {
  const english = inEnglish.of(tag) ?? tag;
  const own = new Intl.DisplayNames([tag], DISPLAY).of(tag) ?? tag;
  return own === english ? english : `${english} — ${own}`;
}

const collator = new Intl.Collator('en');

// Built here, where the list is shown, so the worker never pays for the labels.
const LANGUAGES = LANGUAGE_TAGS.map((tag) => ({ tag, label: languageLabel(tag) })).sort((a, b) =>
  collator.compare(a.label, b.label),
);

interface LanguageSelectProps {
  choice: LanguageChoice;
  onChange: (choice: LanguageChoice) => void;
}

export function LanguageSelect({ choice, onChange }: LanguageSelectProps) {
  return (
    <label class="language">
      Summary language
      <select
        value={choice ?? AUTO}
        onChange={(event) => {
          const { value } = event.currentTarget;
          onChange(value === AUTO ? null : value);
        }}
      >
        <option value={AUTO}>
          {`Auto: Chrome's language (${languageLabel(browser.i18n.getUILanguage())})`}
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
