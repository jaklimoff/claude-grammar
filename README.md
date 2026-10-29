# grammar

A Claude Code plugin that checks the English of each prompt you send and shows the fixes right under it.

If English is not your first language, you write it all day in your prompts, and nobody tells you where it goes wrong. Claude understands you anyway, so the same mistakes stay. With this plugin, Haiku proofreads each prompt after you send it, and a dim line under that prompt in the transcript shows what to fix:

```
> it should appea somewhere about the prompt
    appea appear typo  ·  about above wrong word
```

The wrong words are struck through in red, the fixes are green, and a few words say why. When a sentence is still clearly unidiomatic once the grammar is fixed, a second line shows how a native speaker would say it.

## Install

```
/plugin marketplace add jaklimoff/claude-grammar
/plugin install grammar@grammar
```

Or in one step from the shell (v2.1.292+): `claude plugin install grammar --marketplace jaklimoff/claude-grammar`.

Tested with Claude Code v2.1.312, in the terminal. Mods can change between releases, so if the line stops showing after an update, check the [mods changelog](https://code.claude.com/docs/en/changelog).

The lines use Nerd Font glyphs. Without a Nerd Font in your terminal, the icons show as empty squares.

## What it checks

Only spelling, grammar (tense, agreement, articles, prepositions, word order), a wrong word or a missing word. It leaves alone lowercase, punctuation style, dropped apostrophes (`lets`, `dont`), slang and short forms (`smth`, `pls`, `btw`), code, paths, logs and pasted text. A clean prompt, or one that is not English, gets no line.

Slash commands and hidden prompts are not checked, and neither is anything in `claude -p` or the SDK, where nothing would show the result.

## What it sends, and what it costs

Each prompt you type (its first 6000 characters) goes to Haiku through Claude Code's own model access, on the same account and provider as the rest of your session. That is one small Haiku call per prompt, at low effort, counted in your usage like any other. Nothing goes anywhere else.

A mod is code that runs inside Claude Code with your permissions, so read it before you install it. This one uses only `$.model.complete` (the Haiku call), `$.state` (the checks, in memory for the session), `$.store` (the two on/off switches), `$.command.register` (`/grammar`), `$.session.surfaces` (to skip runs that draw nowhere), `$.clock.after` and `$.ui.resolve` (drawing the lines). No files, no processes, no other network. `claude plugin validate .` prints the same list for any mod.

## Use

- Send prompts as usual. The fixes show under each one a second or two later.
- Each prompt keeps its own lines, so scrolling back shows them all for the session.
- `/grammar` toggles the check, `/grammar on` and `/grammar off` set it.
- `/grammar natural on|off` switches only the native-speaker line.
- Both switches last across sessions.

## How it works

The whole plugin is one file, `hooks/grammar.tsx`, about 250 lines. It is a Claude Code mod: a plugin whose `hooks/hooks.json` lists a module that runs inside Claude Code ([mods docs](https://code.claude.com/docs/en/plugins/mods/overview)). It hooks four events:

| Event | What it does |
|---|---|
| `session.start` | Reads the switches from `$.store` and registers `/grammar`. |
| `command.run` | Handles `/grammar`. |
| `prompt.submit` | Queues a check of the prompt on a timer, so the prompt is never held up, and passes it on unchanged. |
| `ui.render` (`UserMessage`) | Draws the fixes and the native-speaker line under the transcript row of the prompt they belong to. |

The check asks Haiku for JSON (`{"english": true, "fixes": [{"from", "to", "why", "sentence"}], "natural": null}`); the system prompt is at the top of the file, so tune it there.

The tests in `tests/grammar.test.ts` show each behaviour, with Haiku mocked. Run them with:

```
claude plugin test .
```

For development, start Claude Code with `claude --plugin-dir <path to this folder>`.

Works well beside [open-questions](https://github.com/jaklimoff/claude-open-questions): the answers it sends for you are not checked, since they hold Claude's own words.

## Contributing

Issues and PRs welcome. Run `claude plugin validate --strict .` and `claude plugin test .` before sending one.

## License

MIT
