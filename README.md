# grammar

[![test](https://github.com/jaklimoff/claude-grammar/actions/workflows/test.yml/badge.svg)](https://github.com/jaklimoff/claude-grammar/actions/workflows/test.yml)

A Claude Code plugin that checks the English of each prompt you send and shows the fixes right under it.

![A prompt with three mistakes; a line under it strikes each one through in red, shows the fix in green, and says why](https://raw.githubusercontent.com/jaklimoff/claude-grammar/media/demo.gif)

If English is not your first language, you write a lot of it in your prompts, and nobody tells you where it goes wrong. Claude understands you anyway, so the same mistakes stay. With this plugin, Haiku proofreads each prompt after you send it, and a dim line under that prompt shows what to fix: the wrong words struck through in red, the fixes in green, and a few words on why. When a sentence still sounds off once the grammar is fixed, a second line shows how a native speaker would say it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jaklimoff/claude-grammar/media/cost-brand-dark.png">
  <img alt="What the grammar check costs: a 50-prompt session is $0.003 to $0.035. Per check: a clean prompt $0.00006 (539 tokens in, 21 out); 3 mistakes $0.0003 to $0.0005 (550 in, 540 to 820 out); 5+ mistakes $0.0006 to $0.0007 (575 in, 1,010 to 1,250 out). Claude Haiku 5.5 at low effort, API prices, measured 2026-10-30." src="https://raw.githubusercontent.com/jaklimoff/claude-grammar/media/cost-brand-light.png">
</picture>

How it was measured: [Privacy and cost](#privacy-and-cost).

## Install

```
/plugin marketplace add jaklimoff/claude-grammar
/plugin install grammar@grammar
```

Or in one step from the shell (v2.1.292+):

```
claude plugin install grammar --marketplace jaklimoff/claude-grammar
```

## Use

Send prompts as usual. The fixes show under each one a few seconds later, while Claude works. Each prompt keeps its own lines, so scrolling back shows them all for the session.

| Command | What it does |
|---|---|
| `/grammar` | Turns the check on or off. |
| `/grammar on`, `/grammar off` | Sets it. |
| `/grammar natural on\|off` | Switches only the native-speaker line. |

Both switches last across sessions.

## What it checks

- **Checked:** spelling, grammar (tense, agreement, articles, prepositions, word order), a wrong word, a missing word.
- **Left alone:** lowercase, punctuation style, dropped apostrophes (`lets`, `dont`), slang and short forms (`smth`, `pls`, `btw`), code, paths, logs and pasted text.
- **No line at all:** a clean prompt, a prompt that is not English, slash commands, and anything in `claude -p` or the SDK, where nothing would show it.

The native-speaker line is rare on purpose. It shows only when a sentence is clearly unidiomatic even with the grammar fixed, not for style.

## Privacy and cost

Each prompt you type (its first 6000 characters) goes to Haiku through Claude Code's own model access, on the same account and provider as the rest of your session. That is one small Haiku call per prompt, at low effort, counted in your usage like any other call. Nothing goes anywhere else.

What one check costs, measured on 2026-10-30 with the mod's system prompt (natural phrasing on), Claude Haiku 5.5 at low effort, 5 runs per prompt:

| Prompt | Input tokens | Output tokens | Cost at API prices |
|---|---|---|---|
| Clean, 35 characters | 539 | 21 | ~$0.00006 |
| 3 mistakes, 80 characters | 550 | 540 to 820 | ~$0.0003 to $0.0005 |
| 5+ mistakes, 200 characters | 575 | 1,010 to 1,250 | ~$0.0006 to $0.0007 |

About 517 of the input tokens are the mod's instructions. A clean prompt costs almost nothing to answer; when Haiku finds mistakes, it thinks and writes out the fixes, and that is most of the output. A session of 50 prompts comes to roughly 30K tokens if you write clean and up to 90K if every prompt has several mistakes: about $0.003 to $0.035 at Haiku's API prices ($0.10 per 1M input tokens, $0.50 per 1M output). On a subscription the same tokens count toward your plan's usage instead. `/grammar off` stops the calls.

A mod is code that runs inside Claude Code with your permissions, so read it before you install it. This one uses only:

| API | For |
|---|---|
| `$.model.complete` | The Haiku call. |
| `$.state` | The checks, in memory for the session. |
| `$.store` | The two on/off switches. |
| `$.command.register` | `/grammar`. |
| `$.session.surfaces` | Skipping runs that draw nowhere. |
| `$.clock.after`, `$.ui.resolve` | Running the check off the prompt's path, and drawing the lines. |

No files, no processes, no other network. `claude plugin validate .` prints the same list for any mod. The full note is in [PRIVACY.md](PRIVACY.md).

## Requirements

- Claude Code with mods. Tested with v2.1.314, in the terminal. Mods can change between releases, so if the line stops showing after an update, check the [changelog](https://code.claude.com/docs/en/changelog).
- A Nerd Font in your terminal for the icons. Without one, they show as empty squares.
- Not drawn in the VS Code extension or in `claude -p`.

## How it works

The whole plugin is one file, `hooks/grammar.tsx`, about 250 lines. It is a Claude Code mod: a plugin whose `hooks/hooks.json` lists a module that runs inside Claude Code ([mods docs](https://code.claude.com/docs/en/plugins/mods/overview)). It hooks four events:

| Event | What it does |
|---|---|
| `session.start` | Reads the switches from `$.store` and registers `/grammar`. |
| `command.run` | Handles `/grammar`. |
| `prompt.submit` | Queues a check of the prompt on a timer, so the prompt is never held up, and passes it on unchanged. |
| `ui.render` (`UserMessage`) | Draws the fixes and the native-speaker line under the transcript row of the prompt they belong to. |

The check asks Haiku for JSON:

```json
{ "english": true, "fixes": [{ "from": "...", "to": "...", "why": "...", "sentence": "..." }], "natural": null }
```

The system prompt is at the top of the file, so tune it there.

Works well beside [open-questions](https://github.com/jaklimoff/claude-open-questions): the answers it sends or appends for you are not checked, since they quote Claude's own words.

## Development

```
claude --plugin-dir .          # run Claude Code with your working copy
claude plugin test .           # the tests in tests/grammar.test.ts, with Haiku mocked
claude plugin validate --strict .
vhs docs/demo.tape             # record the demo GIF again; it lives on the media branch (see the tape)
```

## Contributing

Issues and PRs welcome. Run `claude plugin validate --strict .` and `claude plugin test .` before sending one.

## License

[MIT](LICENSE)
