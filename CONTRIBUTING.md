# Contributing

Issues and pull requests are welcome. For anything bigger than a small fix, open an issue first so we can agree on the shape before you write the code.

## Setup

You need Claude Code (v2.1.314 or later) and, for the tools in `tools/` and `docs/`, [Bun](https://bun.sh).

```
git clone https://github.com/jaklimoff/claude-grammar && cd claude-grammar
claude --plugin-dir .              # Claude Code with your working copy of the mod
```

Claude Code writes the mod's type definitions to `.claude-plugin/types/` the first time it loads the plugin; `tsconfig.json` points at them.

## Before you send a pull request

```
claude plugin test .               # the tests, with the model mocked: no calls, no cost
claude plugin validate --strict .  # the plugin's manifest, hooks and API use
npx tsc --noEmit -p .              # types
```

CI runs the first two on every push and pull request, and weekly against the latest Claude Code.

- **Tests.** A change in behavior comes with a test in `tests/grammar.test.ts`. The checks, the history and the commands are tested through the engine with the model mocked; the plain helpers in `hooks/check.ts`, `hooks/history.ts` and `tools/transcript.ts` are tested directly.
- **Docs match the code.** README.md and PRIVACY.md state exactly what the mod sends, keeps and touches. If your change affects any of that (a new API call, a new file, a new setting, a new command), update both.
- **The system prompt costs money on every check.** Changes to it in `hooks/check.ts` need a reason, and new token counts for the README's cost table (`docs/measure-cost.ts`).

## Versions and releases

Versions follow [semantic versioning](https://semver.org): a fix is a patch, a new feature or setting a minor version.

Installed copies update only when the version in `.claude-plugin/plugin.json` changes, so a change to what ships (anything under `hooks/`, `types/`, or `plugin.json` itself) bumps it. Changes to the README, docs or CI alone don't need a bump.

A release is three steps in one pull request:

1. Bump `version` in `.claude-plugin/plugin.json`.
2. Add a `## X.Y.Z (YYYY-MM-DD)` section at the top of CHANGELOG.md.
3. Merge to `main`.

Once the tests pass on `main`, CI tags the commit `vX.Y.Z` and publishes a GitHub release with that CHANGELOG section as its notes. It fails if the CHANGELOG has no section for the new version.

## Images

The README's GIFs and PNGs live on the `media` branch, so the plugin itself ships no binaries. `docs/render-tour.ts` and `docs/render-cost.sh` render them; commit the results on `media`.

## Security

Don't open a public issue for a vulnerability: see [SECURITY.md](SECURITY.md).
