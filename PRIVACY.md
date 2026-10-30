# Privacy

grammar is a Claude Code plugin. It has no server and collects nothing for its author.

## What it sends

Each prompt you type in Claude Code (its first 6000 characters) is sent to Haiku through Claude Code's own model access, on the same account and provider as the rest of your session, so Haiku can check its English. That request is handled under the terms that already cover your Claude Code session. Slash commands, hidden prompts, and runs that draw nothing (`claude -p`, the SDK) are not sent.

Nothing is sent anywhere else: the plugin makes no other network requests and starts no processes.

## What it keeps

- The checks (each prompt's text and its fixes) live in Claude Code's session state, in memory, and are gone when the session ends.
- Two switches, whether the check and the native-speaker line are on, are saved in the plugin's own Claude Code storage on your machine.

The plugin reads and writes no other files.

## Turning it off

`/grammar off` stops all checks, and so no prompt is sent. Uninstalling the plugin removes it entirely.

## Contact

Questions: open an issue at https://github.com/jaklimoff/claude-grammar/issues.
