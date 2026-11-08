# Contributing

The README's [Development](README.md#development) section builds and loads the extension. [The "no" list](docs/no-list.md) names what the project leaves out on purpose: a feature gets in only if it makes the skim faster or the summary more trustworthy.

## Pull requests

- One branch and one pull request per change, with a [Conventional Commits](https://www.conventionalcommits.org) title.
- Fill in the pull request template, its security review included.
- Maintainers set one type label (`feature`, `improvement`, `fix` or `maintenance`), any concern labels that apply (`accessibility`, `browser-compat`, `performance`, `ui/ux` or `privacy`), and the milestone. The type labels group the release notes.
- A ruleset on `main` requires a pull request whose `verify` check passes, and blocks direct pushes, force pushes and deletion. The repository allows only merge commits, so a pull request's commits reach `main` unchanged.
- CI runs on a pull request from a fork once a maintainer approves the run.

## Git hooks

Run `pnpm exec lefthook install` once after cloning. The hooks check formatting, block API keys in commits, check commit titles and refuse pushes to `main`. They are local only and `--no-verify` skips them.

## Icons

The icon's masters are `apps/extension/design/icon.svg` and `icon-small.svg`, the second drawn on whole pixels for 16 and 32 px. After changing one, run `pnpm icons` and commit the PNGs it writes to `apps/extension/public/icon`. It needs `rsvg-convert` from librsvg: `brew install librsvg` or `apt install librsvg2-bin`.

## Keys and text

Test with your own key on the options page, never in a file, a test or CI; tests use fake keys. Never paste an API key, selected text or a private page address into an issue, a pull request or a log.

## Security and conduct

Report a vulnerability privately, as [SECURITY.md](SECURITY.md) explains. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
