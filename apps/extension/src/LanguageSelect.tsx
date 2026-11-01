import { autoLabel, LANGUAGES } from './languages.ts';

// The select's value for Auto, which the settings store as no choice at all.
const AUTO = '';

interface LanguageSelectProps {
  // Null is Auto.
  choice: string | null;
  onChange: (choice: string | null) => void;
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
        <option value={AUTO}>{autoLabel()}</option>
        {LANGUAGES.map(({ tag, label }) => (
          <option key={tag} value={tag}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
