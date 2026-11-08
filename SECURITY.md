# Security policy

Dr. Too Long keeps the reader's API key on their device and sends the text they select to the provider they chose, so a flaw in how it handles either matters.

## Reporting a vulnerability

Report it through [GitHub's private vulnerability reporting](https://github.com/sametpolat7/dr-too-long/security/advisories/new), never in a public issue or pull request. Describe the flaw, the steps or a proof of concept, and what an attacker gains. Never include a working API key: use a revoked one or a placeholder.

The project has one maintainer, who answers in the private advisory and works out the fix there before anything is made public.

## Supported versions

The extension is not yet on the Chrome Web Store. Only the latest commit on `main` is supported.

## Scope

In scope:

- how the API key is stored, encrypted and removed;
- anything that lets a web page, or the extension's own content scripts, reach the key or the extension's storage, or reach a provider's API other than through the background worker;
- a request that sends the key or the selected text anywhere but the chosen provider's API, or sends more than the selection;
- a permission the extension uses beyond what the README explains.

Out of scope:

- recovering the key with full access to the Chrome profile on disk, a limit the README states;
- flaws in the OpenAI, Anthropic or Google services; report those to the provider;
- selected text that steers a summary's wording (prompt injection), unless it makes the extension do more than show text;
- a dependency advisory that the extension's code cannot reach. CI runs `pnpm audit` on every pull request.
