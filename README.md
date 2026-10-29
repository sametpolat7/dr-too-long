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
4. Open the extension's **Details** page, click **Extension options**, paste your OpenAI API key, click **Save**, then **Test key**. A summary of a built-in sample streams in. Summaries are written in Chrome's own language until you choose another under **Summary language**, on the same page or in the card.
5. Pin the extension's icon from the toolbar's puzzle menu. Open an article, select a few paragraphs and click the icon, press Ctrl+Shift+S (Command+Shift+S on a Mac), or right-click the selection and choose **Summarize "…"**. A card appears at the top right of the page and the summary streams in. Once it is done, click a point in the card: the page highlights the sentences the point rests on and scrolls to the first, and the selection is released, so a further run needs a new selection. If those sentences have left the page, the card says so. Escape or the card's close button dismisses the card and its highlight.
6. Every run starts with **Summary**. The card's **Single sentence** and **Bulleted list** buttons summarize the same selection in those shapes, and a shape you already saw comes back without a new request while the card is open. **Copy** puts the summary on the clipboard as one paragraph or as `- ` bullets; it needs an `https` page. **Regenerate** runs the shown shape again, and errors the provider may clear on a second run offer **Try again**. The card's **Summary language** list writes the summary again in the language you pick and keeps that choice for later summaries, as the same list on the options page does.
7. After a run, selecting another passage of at least 150 characters on the same page shows a **Summarize** bubble above it a moment after you release the mouse button or key; clicking it opens the card for that selection. The bubble never appears while you drag or in a text field, leaves copying alone, and goes away when you press Escape or scroll the text away. **Hide the bubble on this site until the tab closes**, at the foot of the card, keeps it off that site in that tab, also after a reload; the icon, shortcut and menu still work there.
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
| `pnpm evals` | Runs the model evals; see [Model evals](#model-evals) |

Chrome never lets an extension run on `chrome://` pages, the Chrome Web Store or the built-in PDF viewer; the icon shows a `!` badge there for a moment. The extension asks for `activeTab` and `scripting` to run on the page where you use the icon, shortcut or menu item, and to register the every-site script while you allow it, `contextMenus` for that menu item, and `storage` to keep your key and summary language and, in memory until the tab closes, the sites where you hid the bubble. Apart from `api.openai.com`, which the background worker calls, it has no access to any site until you use one of them, or until you tick **Show the bubble on every site**, which asks Chrome for access to every `https` site and can be withdrawn at any time.

Highlights use the CSS Custom Highlight API: the worker inserts one stylesheet rule into the page on each run, and the content script registers the cited sentences under it when you click a point. Highlights add nothing to the page's DOM, and the page's text is never changed.

## Your API key

Phase 1 runs on your own OpenAI API key. Create it in a dedicated OpenAI project with a monthly budget cap and paste it into the Options page, never into a file or CI.

- The key is stored in the extension's local storage, which Chrome does not encrypt. Only this extension's own code can read it, and it is never synced to your Google account.
- The key travels only to `api.openai.com`, from the background service worker. Content scripts never see it, and a lint rule keeps the on-page code from importing the key module or the model.
- With your own key, the text you select goes to OpenAI under your account and OpenAI's terms.
- The key only works while the OpenAI account holds credit. OpenAI reports an empty balance as a quota error, and new credit can take a few minutes to become active.

## Model evals

`apps/evals` runs a fixed corpus of English and Turkish texts through every candidate, a model with a prompt, using the product's own summarizer and validator, has an LLM judge score and rank every candidate's summary of a text side by side, and reports quality, rank, latency and cost per thousand summaries. Run it before changing the active model or the prompt, and put the report in the pull request.

```sh
OPENAI_API_KEY=... pnpm evals run --limit 2
pnpm evals run
pnpm evals rate results/<run>.json
pnpm evals report results/<run>.json
```

- Keys come from the shell only: `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. A candidate whose key is missing is skipped. The judge runs on `OPENAI_API_KEY`; without it, pass `--no-judge`.
- `run` takes `--candidate <id>`, `--preset <id>`, `--language en|tr`, `--output-language <tag>`, `--limit <n>` and `--no-judge`. `--language` with `--output-language` makes a cross-language run, for example English texts summarized in Turkish. A full run over the seeded corpus costs well under a dollar, most of it the judge.
- `rate` shows each text with the candidates' summaries in random order and without candidate ids, and asks for a score from 1 to 5. Every answer is saved, so after Ctrl-C a second run continues with the summaries not yet rated. The report then states on how many rated pairs the judge ordered the summaries the way you did; you rate the text alone, while the judge also scores the citations.
- Results land in `apps/evals/results/`, which Git ignores: a JSON file with every summary, verdict and rating, and a Markdown report beside it. Both name the shipped prompt version and the judge's rubric version; scores are compared only within one run.
- The models, the judge and their list prices live in `apps/evals/src/models.ts`. The shipped model is listed twice, with the shipped prompt and with the previous one (`@prompt-1`, frozen in `apps/evals/src/prompt-v1.ts`), so every run has a prompt baseline; a rival model or prompt joins for its run and leaves after the decision. The texts live in `apps/evals/corpus/`, one Markdown file each with a header naming the title, language, genre, source and license. Every seeded text is openly licensed; texts from your own reading go in the same format.

## Pull requests

- One branch and one pull request per change, with a [Conventional Commits](https://www.conventionalcommits.org) title.
- Merge with **Create a merge commit** once CI is green.
- No direct pushes to `main`. The first commit was the only exception, because GitHub cannot open a pull request into an empty repository.

Git hooks enforce this locally. Run `pnpm exec lefthook install` once after cloning. The hooks check formatting, block API keys in commits, check commit titles and refuse pushes to `main`. They are local only and `--no-verify` skips them, so they support the convention rather than enforce it.
