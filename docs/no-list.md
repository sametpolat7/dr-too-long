# The "no" list

A feature gets in only if it makes the skim faster or the summary more trustworthy.
Everything below stays out. This list changes only through a pull request.

## Scope

- No backend, database, accounts, sign-in, quotas, billing, analytics or telemetry.
- No key of ours. Every reader brings their own OpenAI, Claude or Gemini API key.
- No whole-page, PDF or video summaries, follow-up chat, history or per-site style memory.
- No sidebar or side panel. The toolbar icon opens a small card whose Summarize selection button runs the summary; the shortcut, the menu item and the Summarize button run one directly. Every summary opens in the shape the reader used last.
- No third shape, length settings or tone options. The summary's size follows the text.
- No user setting for the selection cap. It is a constant in `packages/shared`, enforced in the extension. The Summarize button has no delay to configure: it appears when the mouse is released.
- No language-specific sentence rules. ICU's root rules and a merge of uppercase initials set the boundaries in every language; no language's abbreviation or ordinal conventions are special-cased.

## Privacy

- No storing of selected text, summaries or page addresses, and no logging of them in production builds, error messages, test fixtures or pull requests. The one exception is the hostnames where the reader turns the Summarize button off, which the background worker holds in session memory per tab until the tab closes and never writes to disk.
- No `storage.sync`. An API key exists only encrypted on the reader's device, never in files, the extension bundle or CI.

## Model

- One model per provider, set in `packages/shared/src/model`. Readers choose the provider, never the model. Another provider with an AI SDK package can be added there and in `packages/shared/src/providers`.
- No user-editable prompts and no remote prompt or config fetching. Prompts ship in the package.
- No model call from the content script. The background service worker is the only caller.
- No automatic retries and no retry loops. Try again is a button.
- No truncation of long selections. The guard refuses them with a message.

## Page integration

- No selections inside shadow roots, embedded frames, inputs, text areas or editable regions. The summary window says so.
- No changes to the page DOM for highlights and no `<style>` element in the page.
- No re-anchoring on page mutations. A stale anchor is re-found on click, or the summary window says the passage is no longer on the page.
- No `<all_urls>`, `http://` or `file://` access. The every-site opt-in requests `https://*/*` only.

## Platform and engineering

- Chrome Manifest V3 only, minimum version 114: the first with the Popover API, which keeps the summary window and the Summarize button above everything the page draws. It keeps what the earlier floor, 110, was chosen for: an extension service worker with no five-minute lifetime cap. Below 114 only Windows 7 and 8.1 remain, which Chrome stopped updating in January 2023. The bundler target and the TypeScript library (ES2023) follow the floor. No Firefox, Safari or Edge builds.
- No localization of the extension UI. Output language is the only language setting.
- No brand beyond the one icon and its yellow, and no themes beyond light and dark. The summary window follows the page's look, and the toolbar icon's card and the options page follow Chrome's. The yellow marks the summarize action in both themes, so the Summarize button looks the same on every page.
- No Playwright suite and no browser downloads. The smoke test drives the Chrome already installed, through its DevTools pipe.
- No build step for `packages/shared`, no Turborepo, changesets, CHANGELOG or Renovate.
- No version bumps inside feature PRs. Each upgrade is its own chore PR.
- No obfuscation. Shipped code is minified, which the Chrome Web Store allows, but never obfuscated, and the source is public.
- No merges with failing CI and no direct pushes to `main`.
