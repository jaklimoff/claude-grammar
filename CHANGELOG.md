# Changelog

Bump `version` in `.claude-plugin/plugin.json` on every change: installed copies update only when it changes.

## 1.1.0 (2026-10-30)

- Settings under `/config`: model, effort, spelling (any, US, UK), minimum words, maximum characters, plain icons, and whether to show the reason for each fix. The two `/grammar` switches are settings now; 1.0's saved switches move over on the first start.
- Ignore and skip lists in `~/.claude/grammar.json` and a project's `.claude/grammar.json`, plus `/grammar ignore add|rm|list`.
- Checks pause after 3 failures in a row (a blocked model, an outage) instead of failing on every prompt; `/grammar on` resumes.
- Fixes for words the prompt doesn't contain are dropped.
- A prompt no longer shows the fixes of a shorter prompt it starts with.
- Long prompts are cut at a word boundary. The model no longer repeats the whole sentence for each fix, which leaves room in the reply and saves output tokens.
- `/grammar help` lists the commands and shows what is on now; `/grammar` with an unknown word prints the same list instead of toggling.
- The privacy note says pasted text is sent too.

## 1.0.3 (2026-10-30)

A privacy note (PRIVACY.md), and homepage, docs, support and privacy links in plugin.json.

## 1.0.2 (2026-10-30)

Code reads the way the plugin directory's checks expect; the demo GIF moved to the `media` branch.

## 1.0.1 (2026-10-30)

An icon, and the descriptions say each prompt goes to Haiku.

## 1.0.0 (2026-10-29)

First public release: Haiku checks each prompt, the fixes and a native-speaker rewrite show under it, `/grammar` switches both.
