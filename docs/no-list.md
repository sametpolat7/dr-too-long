# Phase 1 "no" list

A feature gets in only if it makes the skim faster or the summary more trustworthy.
Everything below stays out of Phase 1. This list changes only through a pull request.

## Scope

- No backend, accounts, sign-in, quota, billing, privacy policy page or store submission. These are Phase 2.
- No whole-page, PDF or video summaries, follow-up chat, history or per-site style memory.
- No sidebar, popup, side panel or menu before the summary. Every gesture runs Summary directly.
- No fourth preset, length sliders or tone options.
- No user settings for the bubble delay, minimum length or selection cap. They are constants in `packages/shared`.

## Privacy

- No storing or logging of selected text, summaries or page URLs, in any build mode, error message, test fixture or pull request.
- No `storage.sync`, and no API key in files, environment variables or CI.

## Model

- Providers are Anthropic and OpenAI only. The developer sets the provider and model in `packages/shared/src/providers`; users never see or choose them.
- No user-editable prompts and no remote prompt or config fetching. Prompts ship in the package.
- No model call from the content script. The background service worker is the only caller.
- No automatic regenerate and no retry loops. Regenerate and Retry are buttons.
- No truncation of long selections. The guard refuses them with a message.

## Page integration

- No selections inside shadow roots, cross-origin frames, inputs, text areas or editable regions. The card says so.
- No changes to the page DOM for highlights and no `<style>` element in the page.
- No re-anchoring on page mutations. A stale anchor is re-found on click or marked "passage not found".
- No `<all_urls>`, `http://` or `file://` access. The every-site opt-in requests `https://*/*` only.

## Platform and engineering

- Chrome Manifest V3 only, minimum version 116. No Firefox, Safari or Edge builds.
- No localisation of the extension UI. Output language is the only language setting.
- No design pass, branding or final icons. That is Phase 3.
- No Playwright suite and no browser downloads in Phase 1.
- No build step for `packages/shared`, no Turborepo, changesets, CHANGELOG or Renovate.
- No version bumps inside feature PRs. Each upgrade is its own chore PR.
- No obfuscation. Shipped code stays readable, as the Chrome Web Store requires.
- No merges with failing CI and no direct pushes to `main`.
