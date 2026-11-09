# Privacy policy

Dr. Too Long is a free, open-source Chrome extension that summarizes text you select. It has no server, no account, no analytics and no telemetry. Its developer receives none of your data.

Last updated: 2026-11-08.

## What the extension handles

| Data                                                   | Where it is kept                           | Where it goes                                                                                                                                                        | How long it is kept                                                |
| ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Your API key                                           | Encrypted in the extension's local storage | To the provider you chose (OpenAI, Claude or Gemini), over HTTPS, with each summary request and each **Test key**                                                    | Until you remove it on the options page or uninstall the extension |
| The text you select                                    | Nowhere: the extension never stores it     | To the provider you chose, over HTTPS, only when you start a summary with the toolbar icon's card, the shortcut, the menu item or the Summarize button               | Not kept by the extension; see the provider's terms below          |
| Your settings: the summary language and the last shape | The extension's local storage              | To the provider you chose, inside each summary request and each **Test key**, as instructions: the language to write in (Chrome's language under Auto) and the shape | Until you uninstall the extension                                  |
| The sites where you turned the Summarize button off    | In memory, per tab                         | Nowhere                                                                                                                                                              | Until the tab closes, Chrome restarts or the extension reloads     |

The summary comes back from the provider to your browser, where the summary window shows it. The extension does not store summaries or the addresses of the pages you read.

Once a key is saved, opening the toolbar icon's card checks, inside the page, whether you selected text and how many words, whether an embedded frame has the focus, and whether the Summarize button is there. Only these answers reach the card, never the words themselves. The card also reads the tab's address to name its site for **Turn off on this site**. It keeps and sends nothing.

When you allow the Summarize button on every site, the extension checks the text you select on each page, inside your browser, to decide whether to offer the button. Nothing is sent until you click it.

## How your key is protected

Your key is encrypted with AES-GCM under a 256-bit key that Chrome generates, keeps in the extension's own storage and never lets any script read. Web pages and the extension's own scripts on those pages never see your key. Only the extension's background worker decrypts it, to call the provider. Your key is never synced to other devices. Someone with full access to your Chrome profile on disk could still recover it, so use a key made for Dr. Too Long, with a spending limit.

## Your provider's terms

Each summary is a request to the provider you chose, under your own account and that provider's terms:

- **OpenAI** does not use API data for training and keeps abuse-monitoring logs for up to 30 days. The extension asks OpenAI not to store the response. See [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data).
- **Claude (Anthropic)** does not use API inputs and outputs for training by default and deletes them within 30 days. See [Anthropic's privacy center](https://privacy.claude.com).
- **Gemini (Google)**: with an unpaid key, Google may use the text to improve its products, and human reviewers may read it. Paid keys are not used that way. See the [Gemini API terms](https://ai.google.dev/gemini-api/terms).

## Your choices

- **Remove key** on the options page deletes your key at once. Uninstalling the extension deletes your key and settings.
- **Turn off on this site**, in the toolbar icon's card, keeps the Summarize button off a site in that tab.
- You can withdraw the every-site access in the toolbar icon's card or on the extension's details page in Chrome.

## Chrome Web Store User Data Policy

The use of information received from Chrome APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use), including the Limited Use requirements. The extension uses your data only to summarize the text you select, never sells or transfers it, and never uses it for advertising or to decide creditworthiness.

## Changes

If the extension ever changes what it sends or keeps, this policy changes in the same release, and the extension asks for your agreement again before it uses your key.

## Contact

Questions about this policy: [open an issue](https://github.com/sametpolat7/dr-too-long/issues/new/choose) or write to samet.polat59@hotmail.com.
