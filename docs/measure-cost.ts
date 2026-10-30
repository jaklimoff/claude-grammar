// Measures one grammar check's tokens for the README's cost table: Haiku 5.5, low effort, 5 runs per prompt (run it twice for 10).
//   git show <old tag>:hooks/grammar.tsx > /tmp/old.tsx
//   bun docs/measure-cost.ts /tmp/old.tsx hooks/grammar.tsx <file with ANTHROPIC_API_KEY=...>
//   ONLY=new bun docs/measure-cost.ts ...   (just the current prompt)
// The new prompt is system({ natural: true }) with default settings; keep the regexes in step with hooks/check.ts and hooks/history.ts.
import { readFileSync } from "node:fs";
const [oldPath, newPath, envPath] = process.argv.slice(2) as [string, string, string];
const grab = (src: string, re: RegExp) => src.match(re)![1]!;
const oldSrc = readFileSync(oldPath, "utf8");
// The prompt is in check.ts beside the given file, the kinds in history.ts.
const newSrc = ["check.ts", "history.ts"].map(f => readFileSync(newPath.replace(/[^/]+$/, f), "utf8")).join("\n");
const oldSystem = ["BASE", "ANSWER", "NATURAL"].map(n => grab(oldSrc, new RegExp(`const ${n} = \`([\\s\\S]*?)\``))).join("\n");
// New: system({ natural: true }) with the defaults: dialect any, why shown, no ignore words.
// The kind of each fix is asked for while the history is on, the default.
const kinds = grab(newSrc, /export const KINDS = \[([\s\S]*?)\] as const/).match(/'([^']*)'/g)!.map(k => k.slice(1, -1)).join(", ");
const kindField = grab(newSrc, /const KIND = `([^`]*)`/).replace("${KINDS.join(', ')}", kinds);
const answer = grab(newSrc, /const answer = \(showWhy: boolean, kind: boolean\) => `([\s\S]*?)`\n/)
  .replace(/\$\{showWhy \? '([^']*)' : ''\}/, "$1")
  .replace("${kind ? KIND : ''}", kindField);
const newSystem = [
  grab(newSrc, /const BASE = `([\s\S]*?)`/),
  grab(newSrc, /any: '([^']*)'/),
  answer,
  grab(newSrc, /const KIND_RULE = `([^`]*)`/),
  grab(newSrc, /const NATURAL = `([\s\S]*?)`/),
].join("\n");
const key = readFileSync(envPath, "utf8").match(/ANTHROPIC_API_KEY=(.*)/)![1]!.trim().replace(/^["']|["']$/g, "");
const H = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
const model = "claude-haiku-5-5";
const ct = async (sys: string | undefined) => ((await (await fetch("https://api.anthropic.com/v1/messages/count_tokens", { method: "POST", headers: H, body: JSON.stringify({ model, ...(sys ? { system: sys } : {}), messages: [{ role: "user", content: "x" }] }) })).json()) as any).input_tokens as number;
const prompts = [
  "fix the failing test in auth.ts pls",
  "explain me in one sentence what is doing the /users endpoint when cache is empty",
  "i think we should to move the retry logic in separate module, because now it duplicating in three places and when somebody will change it they forget about other two. can you do it and update tests?",
];
const bare = await ct(undefined);
for (const [name, system, maxTokens] of ([["old", oldSystem, 2048], ["new", newSystem, 4096]] as const).filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  console.log(`\n== ${name}: system ≈ ${(await ct(system)) - bare} tokens`);
  for (const p of prompts) {
    const runs = await Promise.all(Array.from({ length: 5 }, async () => {
      const j: any = await (await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: H, body: JSON.stringify({ model, max_tokens: maxTokens, output_config: { effort: "low" }, system, messages: [{ role: "user", content: p }] }) })).json();
      if (!j.usage) throw new Error(JSON.stringify(j).slice(0, 300));
      const text = j.content.find((b: any) => b.type === "text")?.text ?? "";
      let fixes = -1; try { fixes = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).fixes.length } catch {}
      return { i: j.usage.input_tokens, o: j.usage.output_tokens, think: j.content.some((b: any) => b.type === "thinking"), chars: text.length, fixes, stop: j.stop_reason };
    }));
    const os = runs.map(r => r.o).sort((a, b) => a - b);
    console.log(`${p.length} chars | in ${runs[0]!.i} | out ${os.join(", ")} | thinking ${runs.filter(r => r.think).length}/5 | answer chars ${runs.map(r => r.chars).join(",")} | fixes ${runs.map(r => r.fixes).join(",")} | stop ${[...new Set(runs.map(r => r.stop))].join(",")}`);
  }
}
