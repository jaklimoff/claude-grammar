# grammar

[![test](https://github.com/jaklimoff/claude-grammar/actions/workflows/test.yml/badge.svg)](https://github.com/jaklimoff/claude-grammar/actions/workflows/test.yml)

A Claude Code plugin that checks the English of each prompt you send and shows the fixes right under it.

![A prompt with three mistakes; a line under it strikes each one through in red, shows the fix in green, and says why](https://raw.githubusercontent.com/jaklimoff/claude-grammar/media/demo.gif)

If English is not your first language, you write a lot of it in your prompts, and nobody tells you where it goes wrong. Claude understands you anyway, so the same mistakes stay. With this plugin, Haiku proofreads each prompt after you send it, and a dim line under that prompt shows what to fix: the wrong words struck through in red, the fixes in green, and a few words on why. When a sentence still sounds off once the grammar is fixed, a second line shows how a native speaker would say it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jaklimoff/claude-grammar/media/cost-brand-dark.png">
  <img alt="What the grammar check costs: a 50-prompt session is $0.003 to $0.02. Per check: a clean prompt $0.00006 (520 tokens in, 21 out); 3 mistakes $0.0003 to $0.0004 (531 in, 447 to 691 out); 5+ mistakes $0.00015 to $0.0003 (556 in, 193 to 487 out). Claude Haiku 5.5 at low effort, API prices, measured 2026-10-30 on version 1.1.0." src="https://raw.githubusercontent.com/jaklimoff/claude-grammar/media/cost-brand-light.png">
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
| `/grammar help` | Lists the commands and shows what's on now: the check, the natural line, the model and the limits. |
| `/grammar` | Turns the check on or off. |
| `/grammar on`, `/grammar off` | Sets it. `on` also resumes checks paused after 3 failures in a row. |
| `/grammar natural on\|off` | Switches only the native-speaker line. |
| `/grammar ignore add <words>` | Never flags these words. Separate phrases with commas: `pull request, kubectl`. |
| `/grammar ignore rm <words>` | Flags them again. |
| `/grammar ignore` | Shows the ignore and skip lists and the files they're in. |

Both switches are settings, so they last across sessions and show under `/config` too.

## Settings

Under `/config`, or in `settings.json` under `pluginConfigs.grammar.options`:

| Setting | Default | What it does |
|---|---|---|
| `enabled` | `true` | Checks your prompts. Same as `/grammar on\|off`. |
| `natural` | `true` | The native-speaker line. Same as `/grammar natural on\|off`. |
| `model` | `haiku` | `haiku` or `sonnet`. Sonnet catches more and costs more. |
| `effort` | `low` | `low`, `medium` or `high`. |
| `dialect` | `any` | `any` accepts US and UK spelling. `us` or `uk` flags the other one's spellings. |
| `min_words` | `2` | Shorter prompts (`ok`, `yes`, `continue`) aren't checked. |
| `max_chars` | `6000` | How much of a long prompt is checked and sent, cut at a word boundary. |
| `icons` | `true` | Off draws plain characters for terminals without a Nerd Font. |
| `show_why` | `true` | The short reason after each fix. |

## Ignore and skip lists

Put a `grammar.json` in your Claude Code folder (`~/.claude/grammar.json`, or `$CLAUDE_CONFIG_DIR/grammar.json`) for every project. Put one in a project's `.claude/grammar.json` for that project only. Both files are read on every prompt, and their lists are combined.

```json
{
  "ignore": ["kubectl", "pnpm", "pull request", "/^[A-Z]+-\\d+$/"],
  "skip": ["^(ok|yes|continue|go on)\\b", "^deploy "]
}
```

- **`ignore`:** words and phrases never flagged, matched as whole words in any case. Plain words are also passed to the model so it leaves them alone. Wrap an entry in slashes for a regex, which is matched against each fix.
- **`skip`:** regexes, case-insensitive. A prompt that matches one isn't checked or sent.

`/grammar ignore add|rm` edits the global file and keeps everything else in it. A file that doesn't parse is skipped, with one notice.

## What it checks

- **Checked:** spelling, grammar (tense, agreement, articles, prepositions, word order), a wrong word, a missing word.
- **Left alone:** lowercase, punctuation style, dropped apostrophes (`lets`, `dont`), slang and short forms (`smth`, `pls`, `btw`), code, paths, logs and pasted text.
- **No line at all:** a clean prompt, a prompt that is not English, slash commands, and anything in `claude -p` or the SDK, where nothing would show it.

The native-speaker line is rare on purpose. It shows only when a sentence is clearly unidiomatic even with the grammar fixed, not for style.

## Privacy and cost

Each prompt you type (its first 6000 characters by default, pasted text included) goes to Haiku (or the model you set) through Claude Code's own model access, on the same account and provider as the rest of your session. That is one small call per prompt (Haiku at low effort, unless you change `model` or `effort`), counted in your usage like any other call. Nothing goes anywhere else.

What one check costs, measured on 2026-10-30 with the 1.1.0 system prompt (default settings, natural phrasing on), Claude Haiku 5.5 at low effort, 10 runs per prompt:

| Prompt | Input tokens | Output tokens | Cost at API prices |
|---|---|---|---|
| Clean, 35 characters | 520 | 21 | ~$0.00006 |
| 3 mistakes, 80 characters | 531 | 447 to 691 | ~$0.0003 to $0.0004 |
| 5+ mistakes, 200 characters | 556 | 193 to 487 | ~$0.00015 to $0.0003 |

About 498 of the input tokens are the mod's instructions. A clean prompt costs almost nothing to answer. When Haiku finds mistakes, it writes out the fixes and often thinks first, and that is most of the output. How much it thinks varies more than the number of mistakes does: in these runs it thought every time on the 80-character prompt and only 4 times in 10 on the longer one, so the longer prompt came out cheaper. A session of 50 prompts comes to roughly 27K tokens if you write clean and up to about 60K if every prompt has mistakes: about $0.003 to $0.02 at Haiku's API prices ($0.10 per 1M input tokens, $0.50 per 1M output). On a subscription the same tokens count toward your plan's usage instead. `/grammar off` stops the calls.

A mod is code that runs inside Claude Code with your permissions, so read it before you install it. This one uses only:

| API | For |
|---|---|
| `$.model.complete` | The Haiku call. |
| `$.state` | The checks, in memory for the session. |
| `$.config.set` | Saving `/grammar on\|off` and `natural on\|off` as settings. |
| `$.store` | Reading and clearing where 1.0 kept the two switches, once. |
| `$.command.register` | `/grammar`. |
| `$.fs.exists`, `$.fs.read`, `$.fs.write`, `$.env.get`, `$.session.root` | Finding and reading your `grammar.json` files. Only `/grammar ignore add\|rm` writes, and only to the global one. |
| `$.ui.toast` | The one notice for a `grammar.json` that doesn't parse. |
| `$.session.surfaces` | Skipping runs that draw nowhere. |
| `$.clock.after`, `$.ui.resolve` | Running the check off the prompt's path, and drawing the lines. |

No other files, no processes, no other network. `claude plugin validate .` prints the same list for any mod. The full note is in [PRIVACY.md](PRIVACY.md).

## Requirements

- Claude Code with mods. Tested with v2.1.314, in the terminal. Mods can change between releases, so if the line stops showing after an update, check the [changelog](https://code.claude.com/docs/en/changelog).
- A Nerd Font in your terminal for the icons. Without one, they show as empty squares; set `icons` to off for plain characters.
- Not drawn in the VS Code extension or in `claude -p`.

## How it works

The plugin is two files: `hooks/grammar.tsx` (the hooks, the prompt and the drawing) and `hooks/config.ts` (settings and ignore lists). It is a Claude Code mod: a plugin whose `hooks/hooks.json` lists a module that runs inside Claude Code ([mods docs](https://code.claude.com/docs/en/plugins/mods/overview)). It hooks four events:

| Event | What it does |
|---|---|
| `session.start` | Sets the switches from the settings (moving 1.0's from `$.store` once) and registers `/grammar`. |
| `command.run` | Handles `/grammar`. |
| `prompt.submit` | Queues a check of the prompt on a timer, so the prompt is never held up, and passes it on unchanged. |
| `ui.render` (`UserMessage`) | Draws the fixes and the native-speaker line under the transcript row of the prompt they belong to. |

The check asks Haiku for JSON:

```json
{ "english": true, "fixes": [{ "from": "...", "to": "...", "why": "..." }], "natural": null }
```

Fixes for words that aren't in the prompt, or are on your ignore list, are dropped before they're drawn. The system prompt is at the top of `hooks/grammar.tsx`, so tune it there.

Works well beside [open-questions](https://github.com/jaklimoff/claude-open-questions): the answers it sends or appends for you are not checked, since they quote Claude's own words.

## Development

```
claude --plugin-dir .          # run Claude Code with your working copy
claude plugin test .           # the tests in tests/grammar.test.ts, with Haiku mocked
claude plugin validate --strict .
vhs docs/demo.tape             # record the demo GIF again; it lives on the media branch (see the tape)
bun docs/measure-cost.ts ...   # measure a check's tokens for the cost table (usage in the file)
docs/render-cost.sh brand      # render the cost card PNGs; they live on the media branch
```

## Contributing

Issues and PRs welcome. Run `claude plugin validate --strict .` and `claude plugin test .` before sending one.

## License

[MIT](LICENSE)
