// Grammar: after each prompt you send, Haiku checks its English and a dim line under that prompt in the
// transcript shows the fixes and, when the phrasing is clearly off, how a native speaker would say it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { GrammarCheck, GrammarFix, GrammarReply } from '../types'

const isOn = atom({ plugin: 'grammar', key: 'grammarOn' } as const, true)
const isNatural = atom({ plugin: 'grammar', key: 'grammarNatural' } as const, true)
// The latest checks, newest first, each with the prompt it checked.
const checks = atom({ plugin: 'grammar', key: 'grammarChecks' } as const, [] as GrammarCheck[])
const lastId = atom({ plugin: 'grammar', key: 'grammarLastId' } as const, 0)

// $.store keys, so the switches last across sessions.
const STORE_ON = 'grammar.on'
const STORE_NATURAL = 'grammar.natural'

const MODEL = 'haiku'
const MAX_CHARS = 6000
const MAX_CHECKS = 200

const ICON = {
  logo: '',
  error: '',
  natural: '',
}

const BASE = `You proofread English that a non-native speaker typed as a prompt to a coding assistant.
Report only real mistakes: spelling and typos, grammar (tense, agreement, articles, prepositions, word order), a wrong word, a missing word.
Ignore all of these: capitalization (a lowercase "i" or sentence start is fine), punctuation style, apostrophes left out of contractions (lets, dont, im, thats), a casual tone, slang and short forms (smth, pls, u, btw, lol, etc), code, commands, file paths, identifiers, URLs, logs, and quoted or pasted text.
Keep the writer's voice: change as few words as possible, never rephrase for style.`

const ANSWER = `Answer with JSON only, no prose and no code fence:
{"english": true, "fixes": [{"from": "<exact words from the text>", "to": "<the fixed words>", "why": "<2 to 4 words>", "sentence": "<the whole sentence with every fix in it applied, in the writer's own casing>"}]}
"fixes" is [] when the English is fine. If the text is not mainly English, answer {"english": false, "fixes": []}.`

const NATURAL = `Also add "natural" to the JSON: null in most cases. Only when a native speaker would clearly say a sentence differently (an unidiomatic phrase, a word-for-word translation), even with the grammar fixed, give that one sentence the way a native speaker would say it: same meaning, same casual tone, the writer's own casing.
Never use "natural" for style taste, for a sentence that is fine once the fixes are applied, or for code.`

/** The system prompt, with the natural-phrasing ask when it is on. */
export const system = (natural: boolean) => [BASE, ANSWER, ...(natural ? [NATURAL] : [])].join('\n')

const isFix = (x: unknown): x is GrammarFix => {
  const f = x as Record<string, unknown>
  return typeof f?.from === 'string' && typeof f.to === 'string' && typeof f.why === 'string' && typeof f.sentence === 'string'
}

/** Haiku's reply as fixes and a natural rewrite, or null when the text is not English. Throws on a reply that is not the JSON asked for. */
export const parseReply = (text: string): GrammarReply | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error('no JSON in the reply')
  }
  const reply = JSON.parse(text.slice(start, end + 1)) as { english?: unknown; fixes?: unknown; natural?: unknown }
  if (reply.english === false) {
    return null
  }
  if (!Array.isArray(reply.fixes)) {
    throw new Error('no fixes in the reply')
  }
  const fixes = reply.fixes.filter(isFix).filter(f => f.from.trim() !== f.to.trim())
  const natural = typeof reply.natural === 'string' && reply.natural.trim() !== '' ? reply.natural.trim() : null
  return { fixes, natural }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The natural rewrite, unless it only repeats the prompt or a corrected sentence. */
export const usefulNatural = (natural: string | null, text: string, fixes: GrammarFix[]): string | null =>
  natural === null || same(natural, text) || fixes.some(f => same(natural, f.sentence)) ? null : natural

/** The check of the prompt a transcript row shows: the newest whose text starts the row (other plugins may append to a prompt). */
export const checkFor = (all: GrammarCheck[], rowText: string): GrammarCheck | undefined => {
  const row = rowText.trim()
  return all.find(c => c.text !== '' && row.startsWith(c.text))
}

// Answers sent by the open-questions plugin (github.com/jaklimoff/claude-open-questions) quote Claude's own words: not checked.
const ANSWERS = /(^|\n\n)Answers? to your question/

/** The part of a prompt you typed: without the answers open-questions may have appended. */
export const typedPart = (text: string) => {
  const m = ANSWERS.exec(text)
  return (m === null ? text : text.slice(0, m.index)).trim()
}

const setOn = async ($: EngineInterface, want: boolean) => {
  await update($, isOn, () => want)
  await $.store.set(STORE_ON, want)
}

const ask = async ($: EngineInterface, text: string, natural: boolean) => {
  const request = { model: MODEL, system: system(natural), prompt: text.slice(0, MAX_CHARS), maxTokens: 2048, effort: 'low' as const, timeoutMs: 30000 }
  try {
    return await $.model.complete(request)
  } catch (err) {
    // Only a request the engine refuses to send rejects (a blocked model, say).
    return { isAnswered: false as const, reason: (err as Error).message }
  }
}

const run = async ($: EngineInterface, id: number, text: string) => {
  const r = await ask($, text, await read($, isNatural))
  let result: GrammarCheck | null
  if (!r.isAnswered) {
    result = { id, text, status: 'error', fixes: [], error: r.reason }
  } else {
    try {
      const reply = parseReply(r.text)
      result =
        reply === null
          ? null
          : { id, text, status: 'done', fixes: reply.fixes, natural: usefulNatural(reply.natural, text, reply.fixes) }
    } catch (err) {
      result = { id, text, status: 'error', fixes: [], error: (err as Error).message }
    }
  }
  // Not English: the pending check goes, so the row shows nothing.
  await update($, checks, all => all.flatMap(c => (c.id !== id ? [c] : result === null ? [] : [result])))
}

/** Queues a check of a prompt you typed, unless it is off or nothing would show it. */
const queue = async ($: EngineInterface, e: { text: string }) => {
  // Slash commands and hidden prompts are not typed English. Loose, as older type builds lack both fields.
  const { command, isMeta } = e as { command?: unknown; isMeta?: boolean }
  const text = typedPart(e.text)
  if (command !== undefined || isMeta === true || !/[A-Za-z]{2}/.test(text) || !(await read($, isOn))) {
    return
  }
  // A run that draws nowhere (claude -p, the SDK) would never show the fixes: no Haiku call there.
  if ((await $.session.surfaces()).length === 0) {
    return
  }
  const id = await update($, lastId, n => n + 1)
  await update($, checks, all => [{ id, text, status: 'checking' as const, fixes: [] }, ...all].slice(0, MAX_CHECKS))
  // A timer, so the check outlives this dispatch and the prompt is not held up.
  $.clock.after(1, () => void run($, id, text))
}

export const register: Register = on => {
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    const storedOn = await $.store.get(STORE_ON)
    const storedNatural = await $.store.get(STORE_NATURAL)
    await update($, isOn, () => storedOn !== false)
    await update($, isNatural, () => storedNatural !== false)
    await $.command.register({
      name: 'grammar',
      description: 'Turn the English check of your prompts on or off (/grammar, /grammar on|off, /grammar natural on|off)',
    })

    return next(e)
  })

  on('command.run', { command: 'grammar' }, async ($, e) => {
    const [first, sub] = e.args.trim().toLowerCase().split(/\s+/)
    if (first === 'natural') {
      const natural = sub === 'on' ? true : sub === 'off' ? false : !(await read($, isNatural))
      await update($, isNatural, () => natural)
      await $.store.set(STORE_NATURAL, natural)

      return {
        text: natural
          ? 'Natural phrasing on: Haiku also says when a native speaker would put it differently.'
          : 'Natural phrasing off: grammar fixes only.',
      }
    }
    const want = first === 'on' ? true : first === 'off' ? false : !(await read($, isOn))
    await setOn($, want)

    return { text: want ? 'English check on: Haiku checks each prompt you send.' : 'English check off.' }
  })

  // Only prompts with Latin letters can be English.
  on('prompt.submit', { text: /[A-Za-z]{2}/ }, async ($, e, next) => {
    // A failed check must never hold up the prompt.
    await queue($, e).catch(() => undefined)

    return next(e)
  })

  // Under each prompt you typed: its fixes, then the natural rewrite. Nothing while checking or when clean.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    const row = await next(e)
    const c = checkFor(await read($, checks), e.props.text)
    if (c === undefined || c.status === 'checking') {
      return row
    }
    const natural = (await read($, isNatural)) ? c.natural ?? null : null
    if (c.status === 'done' && c.fixes.length === 0 && natural === null) {
      return row
    }

    const { Box, Text } = $.ui.resolve(e)
    const lines: RenderNode[] = []
    if (c.status === 'error') {
      lines.push(
        <Box key="gr-error">
          <Text dimColor wrap="truncate-end">
            {`${ICON.error} no grammar check: ${c.error ?? 'unknown'}`}
          </Text>
        </Box>,
      )
    }
    if (c.fixes.length > 0) {
      lines.push(
        <Box key="gr-fixes">
          <Text wrap="wrap">
            <Text color="suggestion">{`${ICON.logo} `}</Text>
            {c.fixes.map((f, i) => (
              <Text key={`gr-f${i}`}>
                {i > 0 && <Text dimColor>{'  · '}</Text>}
                <Text color="error" strikethrough>
                  {f.from}
                </Text>
                {f.to !== '' && <Text color="success">{` ${f.to}`}</Text>}
                <Text dimColor>{` ${f.why}`}</Text>
              </Text>
            ))}
          </Text>
        </Box>,
      )
    }
    if (natural !== null) {
      lines.push(
        <Box key="gr-natural">
          <Text wrap="wrap">
            <Text color="suggestion">{`${ICON.natural} `}</Text>
            <Text italic dimColor>
              {natural}
            </Text>
          </Text>
        </Box>,
      )
    }

    return (
      <Box key="grammar" flexDirection="column">
        {row}
        <Box flexDirection="column" paddingLeft={2}>
          {lines}
        </Box>
      </Box>
    )
  })
}
