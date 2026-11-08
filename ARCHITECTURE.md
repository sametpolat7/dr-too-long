# Architecture

Dr. Too Long is a Manifest V3 extension built with [WXT](https://wxt.dev) and Preact, in a pnpm monorepo: `apps/extension` holds the extension and `packages/shared` the code its parts share. The one rule that shapes the layout: only the background worker reads the API key and calls a provider. The scripts that run inside web pages never touch the key, the storage or the provider APIs.

## The parts

```mermaid
flowchart LR
  subgraph page["A web page"]
    summarize["Summarize script<br>card, bubble, highlights"]
    everySite["Every-site script<br>bubble only, when allowed"]
  end
  options["Options page"]
  worker["Background worker"]
  storage[("Extension storage<br>and IndexedDB")]
  provider["Provider API<br>OpenAI, Claude or Gemini"]

  summarize -- "runtime messages" --> worker
  everySite -- "runtime messages" --> worker
  summarize -- "summarize port" --> worker
  options -- "summarize port" --> worker
  options -- "saves the key and settings" --> storage
  worker -- "reads and decrypts the key" --> storage
  worker -- "HTTPS, with the key" --> provider
```

| Folder                                        | Runs in             | Holds                                                                                                |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/extension/src/entrypoints`              | each part           | WXT's entrypoints: the worker, the two content scripts and the options page, wiring only             |
| `apps/extension/src/background`               | the worker          | the summarize port server, the message handler, the toolbar action and the every-site registration   |
| `apps/extension/src/content`                  | web pages           | the card, the bubble, reading the selection, the highlights and the page's color scheme              |
| `apps/extension/src/options`                  | the options page    | the key form, the summary language and the every-site option                                         |
| `apps/extension/src/settings`                 | the worker, options | the encrypted key, the summary language and the last shape in extension storage                      |
| `apps/extension/src` (files at the root)      | any part            | what several parts use: the message types, the port client, the language list and the error messages |
| `packages/shared/src/contracts`               | every part          | the request and event types and schemas that cross the summarize port, and the shapes                |
| `packages/shared/src/model`                   | the worker          | the provider models, the prompt, output validation, error mapping and the stall timer                |
| `packages/shared/src/providers`               | every part          | each provider's name, API host, key page and key prefixes                                            |
| `packages/shared/src/segmentation`, `/limits` | content scripts     | sentence splitting and the 10,000-character cap                                                      |

## What may import what

- Content scripts never import `settings`, `background`, `options`, WXT's storage, `@dr-too-long/shared/model` or `@dr-too-long/shared/providers`. A Biome rule enforces it for every file under `src/content`, the content entrypoints and the root files, and `pnpm check:bundle` scans every built content script for the key, storage and provider hosts.
- The options page never imports `@dr-too-long/shared/model` or `readApiKey`. It tests a key through the worker's summarize port, like the card.
- The worker is the only caller of a provider. In production builds the manifest's `connect-src` allows fetches only to the three provider APIs.

## How a summary runs

1. The icon, the shortcut, the menu item or the bubble reaches the worker, which inserts the highlight style and runs the summarize script in the tab.
2. The script reads the selection's visible text, splits it into sentences and refuses an empty, editable, framed or over-long selection with a card that says so.
3. The card opens and asks the worker for a summary over the summarize port: the shape, the output language and the sentences, numbered.
4. The worker checks the request, decrypts the key and calls the provider through the AI SDK. It streams partial points, then the validated summary or an error, back over the port, and closes it.
5. Clicking a point finds its cited sentences on the page and highlights them with the CSS Custom Highlight API, which adds nothing to the page's DOM.

## What is stored

| Where                    | Key                  | What                                                                                                   |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `chrome.storage.local`   | `apiKey`             | the key's provider, and the key encrypted with AES-GCM, with the provider sealed in as additional data |
| `chrome.storage.local`   | `outputLanguage`     | the chosen summary language; absent for Auto                                                           |
| `chrome.storage.local`   | `shape`              | the shape used last                                                                                    |
| `chrome.storage.session` | `hiddenBubble:<tab>` | the hostnames where the bubble is hidden in that tab, in memory only                                   |
| IndexedDB `dr-too-long`  | `keys` / `api-key`   | the non-extractable AES-GCM key that encrypts the API key                                              |

Selected text, summaries and page addresses are never stored. [PRIVACY.md](PRIVACY.md) says the same for readers.

## Checks

`pnpm verify` runs, as CI does: the dependency audit, Biome, TypeScript, the unit tests, the build, `check:manifest` (the whole manifest against `manifest-expected.json`, and the license files), `check:bundle`, and `pnpm smoke`, which loads the build into headless Chrome and fails on any error or DevTools issue from the worker or the options page.
