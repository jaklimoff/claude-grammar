# Security

grammar is a Claude Code mod: code that runs inside Claude Code with your permissions. It sends each prompt you type to a model through Claude Code's own model access, and reads and writes a few files in your Claude Code folder. [PRIVACY.md](PRIVACY.md) lists exactly what it sends, keeps and touches.

## Supported versions

Only the latest release gets fixes. Installed copies update when the version changes, so a fix reaches you through the plugin's normal update.

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/jaklimoff/claude-grammar/security/advisories/new), not in a public issue.

Please include what an attacker could do, the version, and the steps or a prompt that shows it. You'll get a reply within a week. Once a fix is released, the advisory is published with credit to you, unless you'd rather not be named.

In scope, for example:

- The mod sending text anywhere other than the model call PRIVACY.md describes, or sending more than it says.
- The mod reading or writing files other than the ones PRIVACY.md names.
- Text in a prompt, a `grammar.json` or the history file that makes the mod do something it shouldn't.
- `tools/import-history.ts` reading transcripts it shouldn't, or keeping more than it says.

Out of scope: what the model itself answers, and Claude Code's own behavior. Report those to [Anthropic](https://www.anthropic.com/responsible-disclosure-policy).
