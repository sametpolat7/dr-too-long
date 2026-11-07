# Dr. Too Long

A Chrome extension that turns selected text into a summary in your language with one click, so you can decide whether the whole text is worth reading. Every point in the summary is anchored to the passage it came from.

**Data:** no server, no database, no analytics. Your key and settings stay in your browser, and the text you select goes only to the provider you chose. Selected text, summaries and page addresses are never stored.

**License:** MIT, see [LICENSE](LICENSE).

**Status:** in development, not yet on the Chrome Web Store. What the project leaves out on purpose is listed in [the "no" list](docs/no-list.md).

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
4. Open the extension's **Details** page and click **Extension options**. Pick **OpenAI**, **Claude** or **Gemini** in the provider list, paste that provider's API key, click **Save**, then **Test key**. A summary of a built-in sample streams in. Summaries are written in Chrome's own language until you choose another under **Summary language**, on the same page or in the card.
5. Pin the extension's icon from the toolbar's puzzle menu. Open an article, select a few paragraphs and click the icon, press Ctrl+Shift+S (Command+Shift+S on a Mac), or right-click the selection and choose **Summarize "…"**. A card appears at the top right of the page and the summary streams in. Once it is done, click a point in the card: the page highlights the sentences the point rests on and scrolls to the first, and the selection is released, so a further run needs a new selection. If those sentences have left the page, the card says so. Escape or the card's close button dismisses the card and its highlight.
6. The card opens with the shape you used last, at first **Summary**: one paragraph that opens with the bottom line. The card's **Key points** button lists the things worth keeping from the same selection, most valuable first. A run keeps going while you look at the other shape, so switching back shows it where it got to, and a shape you already saw comes back without a new request while the card is open. Both fit the text: a sentence or two for a short passage, a short paragraph or a handful of points for a long one. **Copy** puts the summary on the clipboard as one paragraph or as `- ` bullets; it needs an `https` page. **Regenerate** runs the shown shape again, and errors the provider may clear on a second run offer **Try again**. The card's **Summary language** list writes the summary again in the language you pick and keeps that choice for later summaries, as the same list on the options page does.
7. After a run, selecting another passage that holds a complete sentence on the same page shows a **Summarize** bubble above it a moment after you release the mouse button or key; clicking it opens the card for that selection. The bubble never appears while you drag or in a text field, leaves copying alone, and goes away when you press Escape or scroll the text away. **Hide the bubble on this site until the tab closes**, at the foot of the card, keeps it off that site in that tab, also after a reload; the icon, shortcut and menu still work there.
8. To get the bubble without using the icon first, tick **Show the bubble on every site** on the options page and accept Chrome's prompt. The pages you open or reload afterwards offer the bubble on every `https` site. Untick it, or change the extension's site access on its **Details** page, to stop; pages already open stop offering it once reloaded.

Chrome leaves the shortcut unset when another extension already holds it; set or change it at `chrome://extensions/shortcuts`. A selection inside an embedded frame gets a card saying it cannot be summarized.

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
| `pnpm check:bundle` | Fails if a built content script carries key, storage or provider code |

`apps/evals` is kept empty for a future evaluation system; see [its README](apps/evals/README.md).

Chrome never lets an extension run on `chrome://` pages, the Chrome Web Store or the built-in PDF viewer; the icon shows a `!` badge there for a moment. The extension asks for `activeTab` and `scripting` to run on the page where you use the icon, shortcut or menu item, and to register the every-site script while you allow it, `contextMenus` for that menu item, and `storage` to keep your encrypted key, provider, summary language and shape and, in memory until the tab closes, the sites where you hid the bubble. Apart from `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com`, which the background worker calls (only the one for your provider is used), it has no access to any site until you use the icon, shortcut or menu item, or until you tick **Show the bubble on every site**, which asks Chrome for access to every `https` site and can be withdrawn at any time.

Highlights use the CSS Custom Highlight API: the worker inserts one stylesheet rule into the page on each run, and the content script registers the cited sentences under it when you click a point. Highlights add nothing to the page's DOM, and the page's text is never changed.

## Providers

Dr. Too Long runs on your own API key from OpenAI, Anthropic or Google. Paste it on the options page, never into a file or CI. One key is saved at a time: saving a key for another provider replaces the old one.

| Provider | Where to create a key | Model | Notes |
| --- | --- | --- | --- |
| OpenAI | [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys) | `gpt-6-luna` | Reasoning effort `none` |
| Claude (Anthropic) | The Claude Console at [platform.claude.com](https://platform.claude.com) | `claude-haiku-5-5` | Thinking off |
| Gemini (Google) | Google AI Studio at [aistudio.google.com](https://aistudio.google.com) | `gemini-3.5-flash-lite` | Has a free tier; see Google below |

Each is that provider's cheapest capable model, set in code in `packages/shared/src/model`: you pick the provider, not the model. A summary costs under a cent on any of them, billed to your own account.

As checked on 2026-11-07:

- Your API key is encrypted with AES-GCM under a WebCrypto key that is non-extractable and kept in the extension's IndexedDB. Neither page scripts nor the extension's own content scripts see your API key, and it is never synced. **Remove key**, or uninstalling the extension, deletes it from the extension's storage. Someone with full access to your Chrome profile on disk can still recover it, so use a key created for this extension, with a spending limit.
- Your key and the text you select travel only from the background service worker to the chosen provider's API, under your account and that provider's terms. A lint rule and a bundle check keep the key, storage and provider code out of the on-page scripts.
- OpenAI does not use API data for training and keeps abuse-monitoring logs for up to 30 days. The extension sets `store` to `false`, so OpenAI keeps no stored copy of the response.
- Anthropic does not use API inputs and outputs for training by default and deletes them within 30 days. Organisations under zero data retention cannot call the API from a browser, so their keys are rejected.
- With a free-tier key, Google may use the text to improve its products, and human reviewers may read it. Paid-tier keys are not used that way, and in the EEA, Switzerland and the UK the paid terms apply to free use too.
- An empty balance or a reached spending cap shows as "out of credit or at its spending limit"; check the account's billing settings, then try again.

## Contributing

- One branch and one pull request per change, with a [Conventional Commits](https://www.conventionalcommits.org) title.
- Maintainers set one type label (`feature`, `improvement`, `fix` or `maintenance`), any concern labels that apply (`accessibility`, `browser-compat`, `performance`, `ui/ux` or `privacy`), and the milestone. The type labels group the release notes.
- Merge once CI is green. The repository allows only merge commits, so a pull request's commits reach `main` unchanged.
- No direct pushes to `main`.

Git hooks enforce this locally. Run `pnpm exec lefthook install` once after cloning. The hooks check formatting, block API keys in commits, check commit titles and refuse pushes to `main`. They are local only and `--no-verify` skips them, so they support the convention rather than enforce it.
