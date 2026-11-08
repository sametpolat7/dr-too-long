import { autoLabel, LANGUAGES, type LanguageChoice } from './languages.ts';

const AUTO = '';

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
