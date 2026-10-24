# Dr. Too Long

A Chrome extension that turns selected text into a summary in your language with one click, so you can decide whether the whole text is worth reading. Every point in the summary is anchored to the passage it came from.

**Data:** selected text, summaries and page addresses are never stored. From Phase 2, each request leaves an operational record (sizes, preset, languages, model, timings, cost, outcome) that engineering uses.

**License:** proprietary, all rights reserved. The repository is private and not open source.

**Status:** Phase 1 (Build core) in progress. What stays out of Phase 1 is listed in [docs/no-list.md](docs/no-list.md).

## Development

Requires Node 24 and pnpm 12.

```sh
pnpm install
pnpm build
```

Load the build in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose `apps/extension/.output/chrome-mv3`.
3. After each rebuild, click the extension's **Reload** button.
4. Open the extension's **Details** page, click **Extension options**, paste your OpenAI API key, click **Save**, then **Test key**. A three-point summary of a built-in sample streams in.

For live reload, run `pnpm dev` and load `apps/extension/.output/chrome-mv3-dev` instead. WXT does not launch a browser; you load the build into your own Chrome profile.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds the extension in watch mode with live reload |
| `pnpm build` | Production build into `apps/extension/.output/chrome-mv3` |
| `pnpm zip` | Zips the production build for the Chrome Web Store |
| `pnpm lint` | Checks formatting and lint rules with Biome |
| `pnpm format` | Applies Biome formatting and safe fixes |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Runs the unit tests of every package |
| `pnpm check:manifest` | Fails if the built manifest's permissions differ from `manifest-expected.json` |

Chrome never lets an extension run on `chrome://` pages, the Chrome Web Store or the built-in PDF viewer.

## Your API key

Phase 1 runs on your own OpenAI API key. Create it in a dedicated OpenAI project with a monthly budget cap and paste it only into the Options page, never into a file, an environment variable or CI.

- The key is stored in the extension's local storage, which Chrome does not encrypt. Only this extension's own code can read it, and it is never synced to your Google account.
- The key travels only to `api.openai.com`, from the background service worker. Content scripts never see it.
- With your own key, the text you select goes to OpenAI under your account and OpenAI's terms.

## Pull requests

- One branch and one pull request per change, with a [Conventional Commits](https://www.conventionalcommits.org) title.
- Merge with **Create a merge commit** once CI is green.
- No direct pushes to `main`. The first commit was the only exception, because GitHub cannot open a pull request into an empty repository.

Git hooks enforce this locally. Run `pnpm exec lefthook install` once after cloning. The hooks check formatting, block API keys in commits, check commit titles and refuse pushes to `main`. They are local only and `--no-verify` skips them, so they support the convention rather than enforce it.
