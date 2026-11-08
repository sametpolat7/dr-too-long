# Chrome Web Store listing

Everything the Chrome Web Store dashboard asks for, kept beside the code so the two change together. A pull request labeled `privacy` updates the privacy answers below in the same pull request, and the privacy policy with them.

## Store listing

- **Name and summary:** from the manifest. The summary is the manifest's description: "Summarize selected text in your language, with every point linked to its source. Runs on your own OpenAI, Claude or Gemini API key."
- **Category:** Tools, in the Productivity group.
- **Language:** English.
- **Store icon:** `apps/extension/public/icon/128.png`, the same file the package holds: 96 px of artwork inside 16 px of transparent padding.
- **Screenshots,** 1280×800, in this order:
  1. `screenshot-1-key-points.png`: Key points, with the clicked point's sentence highlighted on the page.
  2. `screenshot-2-summary.png`: the Summary shape.
  3. `screenshot-3-dark-page.png`: the card's dark look on a dark page.
  4. `screenshot-4-bubble.png`: the Summarize bubble above a selection.
  5. `screenshot-5-options.png`: the options page with a key saved.
- **Small promo tile,** 440×280: `promo-tile-440x280.png`.
- The screenshots show the real card, bubble and options page, drawn from their own markup and stylesheets, over a demo article written for them. Retake them whenever the interface changes, and keep provider logos out of every image.
- **Homepage URL:** https://github.com/sametpolat7/dr-too-long
- **Support URL:** https://github.com/sametpolat7/dr-too-long/issues/new/choose

### Description

```text
Dr. Too Long summarizes the text you select on a web page, in your language, and links every point of the summary to the sentences it comes from, so you can check it against the source in one click.

HOW IT WORKS
• Select a few paragraphs and click the icon, press Ctrl+Shift+S (Command+Shift+S on a Mac), or right-click the selection and choose Summarize.
• A card beside the page shows a Summary, one paragraph that opens with the bottom line, or Key points, the things worth keeping.
• Click a point and the page highlights the sentences it rests on.
• Write summaries in Chrome's language or in any of 47 languages you pick.
• If you like, a Summarize bubble appears above text you select. Hide it on a site, and that site is remembered for the tab, in memory, until the tab closes.
• The card follows the page's light or dark look, works with a keyboard and a screen reader, and opens on the shape you used last.

WHAT YOU NEED
Your own API key from OpenAI, Anthropic (Claude) or Google (Gemini). Dr. Too Long is free: you pay only your provider for what you use, under your own account, and a summary costs under a cent.

PRIVACY
• No server, no account, no analytics. The text you select goes from your browser to the provider you chose, and only when you start a summary.
• Your key is encrypted on your device and sent only to your provider.
• Selected text, summaries and page addresses are never stored.
• The code is open source: https://github.com/sametpolat7/dr-too-long

Dr. Too Long is an independent project, not affiliated with or endorsed by OpenAI, Anthropic or Google. OpenAI, Claude and Gemini are trademarks of their owners.
```

## Privacy practices

### Single purpose

Dr. Too Long summarizes text the reader selects on a web page, in the reader's language, and links each point of the summary to the sentences it rests on.

### Permission justifications

- **activeTab:** Grants access to the current tab only when the reader clicks the toolbar icon, presses Ctrl/Command+Shift+S or picks Summarize from the context menu, so the extension can read the selection, show the summary card and highlight the cited sentences.
- **scripting:** Injects the packaged summary script and one highlight style rule into that tab. While the reader has allowed the bubble on every site, it also registers the packaged bubble script for https pages.
- **contextMenus:** Adds one Summarize item, shown only for selected text.
- **storage:** Keeps the reader's API key, encrypted with AES-GCM, its provider, the summary language and the last shape on the device. The sites where the reader hid the bubble are kept in session memory per tab.
- **Host permissions (api.openai.com, api.anthropic.com, generativelanguage.googleapis.com):** The background worker sends the selected text, with the reader's own key, to the one provider the reader chose, and streams the summary back. Host access lets it read the error responses these APIs send without CORS headers, so the card can explain a rejected key or a rate limit. A content security policy blocks requests to any other host.
- **Optional host permission (https://\*/\*):** Requested only when the reader ticks "Offer a Summarize bubble on every https site" on the options page. It shows a Summarize button above selected sentences on https pages. Nothing is sent until the reader clicks the bubble, and unticking the option, or changing the site access in Chrome, withdraws it.

### Remote code

No. All code ships in the package. Provider responses are parsed as JSON data and shown as text, never run.

### Data usage

Tick these, and certify all three statements:

- **Authentication information:** the reader's API key, stored encrypted on the device and sent only to the provider the reader chose.
- **Website content:** the text the reader selects, sent to that provider when the reader starts a summary and never stored.
- **Web browsing activity:** the hostnames of sites where the reader hid the bubble, kept in session memory per tab and never sent anywhere. The Chrome Web Store counts domains as browsing activity even when they stay on the device.

### Privacy policy URL

https://github.com/sametpolat7/dr-too-long/blob/main/PRIVACY.md

## Test instructions

```text
Summaries need an API key from OpenAI, Anthropic (Claude) or Google (Gemini). A free Gemini key from https://aistudio.google.com/apikey is enough to review the extension.

1. The options page opens on install. Pick Gemini, paste the key, tick the box that says where the text goes, click Save key, then Test key: a short sample summary appears, and the page says "The key works."
2. Open an article, for example a Wikipedia page, and select two or three paragraphs.
3. Click the toolbar icon, press Ctrl+Shift+S (Command+Shift+S on a Mac), or right-click the selection and choose Summarize. A card at the top right shows the summary.
4. Click Key points, then click a point: the page highlights the sentences it rests on.
5. Without a key, the card says "Save an API key first." and offers Open options.

Chrome does not let extensions run on chrome:// pages, the Chrome Web Store or its PDF viewer; there the icon shows a "!" badge.

The bundled AI SDK contains a Vercel AI Gateway client (ai-gateway.vercel.sh) that the extension never calls. Every model is created for one of the three providers, and the manifest's content security policy blocks requests to any other host.
```

## Distribution

- **Visibility:** public, in all regions.
- **Trader status:** non-trader. The project is free, has no revenue and acts for no business.

## Account and release

- The publisher account has 2-step verification, preferably with a hardware security key: this account can publish code that handles every reader's key.
- Upload the zip attached to the GitHub Release that the release workflow published, never a local build, as CONTRIBUTING's Releasing section explains.
- Leave the manifest without a `key` field. The store assigns the extension's ID at the first upload, and that ID is needed only for the store link.
- After the first upload, opt in to verified uploads on the Package tab: generate an RSA key pair offline, give the dashboard the public key and keep the private key out of the repository and CI, with an offline backup. Each later release is uploaded as a CRX signed with it, so a stolen account alone cannot publish an update.
