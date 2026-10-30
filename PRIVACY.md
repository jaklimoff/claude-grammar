# Privacy

grammar is a Claude Code plugin. It has no server and collects nothing for its author.

## What it sends

Each prompt you type in Claude Code (its first 6000 characters by default, the `max_chars` setting) is sent to Haiku, or the model you set, through Claude Code's own model access, on the same account and provider as the rest of your session, so Haiku can check its English. That request is handled under the terms that already cover your Claude Code session. Text you paste into a prompt is part of it and is sent too. Slash commands, hidden prompts, prompts shorter than `min_words`, prompts matching your `skip` list, and runs that draw nothing (`claude -p`, the SDK) are not sent.

Nothing is sent anywhere else: the plugin makes no other network requests and starts no processes.

## What it keeps

- The checks (each prompt's text and its fixes) live in Claude Code's session state, in memory, and are gone when the session ends.
- Its settings, the two switches among them, are saved in your Claude Code `settings.json` like any plugin's.
- Your ignore and skip lists are in `grammar.json` files you control: one in your Claude Code folder and one in a project's `.claude` folder. The plugin reads them on each prompt. `/grammar ignore add|rm` writes only the one in your Claude Code folder.

The plugin reads and writes no other files.

## Turning it off

`/grammar off` stops all checks, and so no prompt is sent. Uninstalling the plugin removes it entirely.

## Contact

Questions: open an issue at https://github.com/jaklimoff/claude-grammar/issues.
