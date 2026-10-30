// Grammar: after each prompt you send, a model checks its English and a dim line under that prompt in the
// transcript shows the fixes and, when the phrasing is clearly off, how a native speaker would say it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { GrammarCheck, GrammarFix, GrammarReply } from '../types'
import {
  EMPTY,
  applyFixes,
  compileIgnore,
  compileSkip,
  cut,
  entriesFrom,
  isIgnored,
  mergeLists,
  parseLists,
  settingsFrom,
  wordCount,
} from './config'
import type { Dialect, Ignore, Lists, Settings } from './config'

const isOn = atom({ plugin: 'grammar', key: 'grammarOn' } as const, true)
const isNatural = atom({ plugin: 'grammar', key: 'grammarNatural' } as const, true)
// The latest checks, newest first, each with the prompt it checked.
const checks = atom({ plugin: 'grammar', key: 'grammarChecks' } as const, [] as GrammarCheck[])
const lastId = atom({ plugin: 'grammar', key: 'grammarLastId' } as const, 0)
const fails = atom({ plugin: 'grammar', key: 'grammarFails' } as const, 0)

// Where 1.0 kept the two switches; moved into the plugin's settings on the first start of 1.1.
const STORE_ON = 'grammar.on'
const STORE_NATURAL = 'grammar.natural'

const MAX_CHECKS = 200
// Failed checks in a row before the checks pause (a blocked model, an outage).
const MAX_FAILS = 3
// Plain ignore words told to the model; the local filter still drops fixes for all of them.
const MAX_PROMPT_WORDS = 100

const NERD_ICONS = { logo: '', error: '', natural: '' }
const PLAIN_ICONS = { logo: '*', error: '!', natural: '>' }

const BASE = `You proofread English that a non-native speaker typed as a prompt to a coding assistant.
Report only real mistakes: spelling and typos, grammar (tense, agreement, articles, prepositions, word order), a wrong word, a missing word.
Ignore all of these: capitalization (a lowercase "i" or sentence start is fine), punctuation style, apostrophes left out of contractions (lets, dont, im, thats), a casual tone, slang and short forms (smth, pls, u, btw, lol, etc), code, commands, file paths, identifiers, URLs, logs, and quoted or pasted text.
Keep the writer's voice: change as few words as possible, never rephrase for style.`

const DIALECT: Record<Dialect, string> = {
  any: 'Accept American and British spelling alike.',
  us: 'The writer uses American English: a British spelling (colour, organise) is a spelling mistake.',
  uk: 'The writer uses British English: an American spelling (color, organize) is a spelling mistake.',
}

const answer = (showWhy: boolean) => `Answer with JSON only, no prose and no code fence:
{"english": true, "fixes": [{"from": "<exact words from the text>", "to": "<the fixed words>"${showWhy ? ', "why": "<2 to 4 words>"' : ''}}]}
"fixes" is [] when the English is fine. If the text is not mainly English, answer {"english": false, "fixes": []}.`

const NATURAL = `Also add "natural" to the JSON: null in most cases. Only when a native speaker would clearly say a sentence differently (an unidiomatic phrase, a word-for-word translation), even with the grammar fixed, give that one sentence the way a native speaker would say it: same meaning, same casual tone, the writer's own casing.
Never use "natural" for style taste, for a sentence that is fine once the fixes are applied, or for code.`

export type PromptParts = { natural: boolean; dialect?: Dialect; showWhy?: boolean; ignore?: readonly string[] }

/** The system prompt: the rules, the spelling, the user's ignore words, the answer's shape, and the natural-phrasing ask when it is on. */
export const system = ({ natural, dialect = 'any', showWhy = true, ignore = [] }: PromptParts) => {
  const words = ignore.slice(0, MAX_PROMPT_WORDS)
  const never =
    words.length > 0 ? [`Never flag these, the writer means them as written: ${words.map(w => JSON.stringify(w)).join(', ')}.`] : []
  return [BASE, DIALECT[dialect], ...never, answer(showWhy), ...(natural ? [NATURAL] : [])].join('\n')
}

const isFix = (x: unknown): x is GrammarFix => {
  const f = x as Record<string, unknown>
  return typeof f?.from === 'string' && typeof f.to === 'string'
}

/** The reply as fixes and a natural rewrite, or null when the text is not English. Throws on a reply that is not the JSON asked for. */
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
  const fixes = reply.fixes
    .filter(isFix)
    .filter(f => f.from.trim() !== f.to.trim())
    .map(f => ({ from: f.from, to: f.to, why: typeof f.why === 'string' ? f.why : '' }))
  const natural = typeof reply.natural === 'string' && reply.natural.trim() !== '' ? reply.natural.trim() : null
  return { fixes, natural }
}

/** The fixes worth showing: words the prompt holds (the model may quote words that are not there), none on the ignore list. */
export const keepFixes = (fixes: readonly GrammarFix[], text: string, ignore: Ignore) => {
  const lower = text.toLowerCase()
  return fixes.filter(f => f.from.trim() !== '' && lower.includes(f.from.toLowerCase()) && !isIgnored(ignore, f.from))
}

const same = (a: string, b: string) => {
  const plain = (s: string) => s.trim().toLowerCase().replace(/[.!?]+$/, '')
  return plain(a) === plain(b)
}

/** The natural rewrite, unless it only repeats the prompt or the prompt with its fixes, or drops a word the user said to keep. */
export const usefulNatural = (natural: string | null, text: string, fixes: GrammarFix[], ignore: Ignore = { words: [], matchers: [] }) => {
  if (natural === null || same(natural, text) || same(natural, applyFixes(text, fixes))) {
    return null
  }
  const lower = natural.toLowerCase()
  const dropsKept = ignore.words.some(w => text.toLowerCase().includes(w.toLowerCase()) && !lower.includes(w.toLowerCase()))
  return dropsKept ? null : natural
}

/** The check of the prompt a transcript row shows: the newest with the row's text, or the start of it when another plugin appended a block. */
export const checkFor = (all: GrammarCheck[], rowText: string): GrammarCheck | undefined => {
  const row = rowText.trim()
  return all.find(c => c.text !== '' && (row === c.text || row.startsWith(`${c.text}\n`)))
}

// Answers sent by the open-questions plugin (github.com/jaklimoff/claude-open-questions) quote Claude's own words: not checked.
const ANSWERS = /(^|\n\n)Answers? to your question/

/** The part of a prompt you typed: without the answers open-questions may have appended. */
export const typedPart = (text: string) => {
  const m = ANSWERS.exec(text)
  return (m === null ? text : text.slice(0, m.index)).trim()
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The user's grammar.json: in the Claude Code config folder (CLAUDE_CONFIG_DIR, else ~/.claude). */
const globalFile = async ($: EngineInterface) => {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir !== undefined && dir !== '') {
    return `${dir.replace(/[\\/]+$/, '')}/grammar.json`
  }
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home === undefined || home === '' ? undefined : `${home.replace(/[\\/]+$/, '')}/.claude/grammar.json`
}

/** The project's grammar.json, in its .claude folder. */
const projectFile = async ($: EngineInterface) => `${(await $.session.root()).replace(/[\\/]+$/, '')}/.claude/grammar.json`

// Broken files already reported, so each shows one toast, not one per prompt.
const reported = new Set<string>()

/** One file's lists: empty when it is missing; a toast, once, when it does not parse. */
const readLists = async ($: EngineInterface, path: string): Promise<Lists> => {
  try {
    if (!(await $.fs.exists(path))) {
      return EMPTY
    }
    return parseLists(String(await $.fs.read(path)))
  } catch (err) {
    const note = `grammar: ${path} is ignored: ${message(err)}`
    if (!reported.has(note)) {
      reported.add(note)
      $.ui.toast(note)
    }
    return EMPTY
  }
}

/** The global and project lists, joined. */
const loadLists = async ($: EngineInterface): Promise<Lists> => {
  const paths = [await globalFile($), await projectFile($).catch(() => undefined)].filter((p): p is string => p !== undefined)
  const unique = [...new Set(paths)]
  return mergeLists(...(await Promise.all(unique.map(p => readLists($, p)))))
}

/** Saves a setting the way /config does, which reloads the module with it. The reason when it could not. */
const persist = async ($: EngineInterface, field: string, value: boolean): Promise<string | undefined> => {
  try {
    // The row's key as /config names it (an installed copy may carry its marketplace), else the plain one.
    const rows = await $.config.list().catch(() => [])
    const row = rows.find(r => r.provider.plugin.split('@')[0] === 'grammar' && r.key.endsWith(`.${field}`))
    const r = await $.config.set({ key: row?.key ?? `grammar.${field}`, value })
    return 'deny' in r ? String(r.deny) : undefined
  } catch (err) {
    return message(err)
  }
}

const sessionOnly = (reason: string | undefined) => (reason === undefined ? '' : ` (this session only: ${reason})`)

/** Moves the 1.0 switches from $.store into the settings, once. An "off" that could not move still counts. */
const migrate = async ($: EngineInterface) => {
  const moved: Record<string, boolean> = {}
  for (const [key, field] of [
    [STORE_ON, 'enabled'],
    [STORE_NATURAL, 'natural'],
  ] as const) {
    const stored = await $.store.get(key)
    if (stored === undefined) {
      continue
    }
    if (stored === false && (await persist($, field, false)) !== undefined) {
      moved[field] = false
      continue
    }
    await $.store.delete(key)
    if (stored === false) {
      moved[field] = false
    }
  }
  return moved
}

const ask = async ($: EngineInterface, s: Settings, text: string, natural: boolean, ignore: Ignore) => {
  const request = {
    model: s.model,
    system: system({ natural, dialect: s.dialect, showWhy: s.showWhy, ignore: ignore.words }),
    prompt: cut(text, s.maxChars),
    maxTokens: 4096,
    effort: s.effort,
    timeoutMs: 30000,
  }
  try {
    return await $.model.complete(request)
  } catch (err) {
    // Only a request the engine refuses to send rejects (a blocked model, say).
    return { isAnswered: false as const, reason: message(err) }
  }
}

const run = async ($: EngineInterface, s: Settings, id: number, text: string) => {
  // Lists that cannot be read check the prompt as if there were none.
  const lists = await loadLists($).catch(() => EMPTY)
  // A prompt the skip list names: the pending check goes and nothing is sent.
  if (compileSkip(lists.skip).some(re => re.test(text))) {
    await update($, checks, all => all.filter(c => c.id !== id))
    return
  }
  const ignore = compileIgnore(lists.ignore)
  const r = await ask($, s, text, await read($, isNatural), ignore)
  let result: GrammarCheck | null
  if (!r.isAnswered) {
    result = { id, text, status: 'error', fixes: [], error: r.reason }
  } else {
    try {
      const reply = parseReply(r.text)
      const fixes = reply === null ? [] : keepFixes(reply.fixes, text, ignore)
      result =
        reply === null ? null : { id, text, status: 'done', fixes, natural: usefulNatural(reply.natural, text, fixes, ignore) }
    } catch (err) {
      result = { id, text, status: 'error', fixes: [], error: message(err) }
    }
  }
  if (result?.status === 'error') {
    const n = await update($, fails, k => k + 1)
    result = { ...result, paused: n === MAX_FAILS }
  } else {
    await update($, fails, () => 0)
  }
  const final = result
  // Not English: the pending check goes, so the row shows nothing.
  await update($, checks, all => all.flatMap(c => (c.id !== id ? [c] : final === null ? [] : [final])))
}

/** Queues a check of a prompt you typed, unless it is off, paused, too short, or nothing would show it. */
const queue = async ($: EngineInterface, s: Settings, e: { text: string }) => {
  // Slash commands and hidden prompts are not typed English. Loose, as older type builds lack both fields.
  const { command, isMeta } = e as { command?: unknown; isMeta?: boolean }
  const text = typedPart(e.text)
  if (command !== undefined || isMeta === true || !/[A-Za-z]{2}/.test(text) || wordCount(text) < s.minWords) {
    return
  }
  if (!(await read($, isOn)) || (await read($, fails)) >= MAX_FAILS) {
    return
  }
  // A run that draws nowhere (claude -p, the SDK) would never show the fixes: no model call there.
  if ((await $.session.surfaces()).length === 0) {
    return
  }
  const id = await update($, lastId, n => n + 1)
  await update($, checks, all => [{ id, text, status: 'checking' as const, fixes: [] }, ...all].slice(0, MAX_CHECKS))
  // A timer, so the check outlives this dispatch and the prompt is not held up.
  $.clock.after(1, () => {
    const fail = (err: unknown) =>
      update($, checks, all => all.map(c => (c.id === id ? { ...c, status: 'error' as const, error: message(err) } : c)))
    void run($, s, id, text).catch(err => fail(err).catch(() => undefined))
  })
}

const USAGE = `/grammar help: this list, and what is on now
/grammar [on|off]: the English check of your prompts
/grammar natural [on|off]: the native-speaker line
/grammar ignore add <words>: never flag these (phrases: separate with commas)
/grammar ignore rm <words>: flag them again
/grammar ignore: the ignore and skip lists, and their files
More settings (model, spelling, minimum words, icons) are under /config.`

/** Adds or removes entries in the global grammar.json, keeping whatever else the file holds. */
const editIgnore = async ($: EngineInterface, op: 'add' | 'rm', entries: string[]) => {
  const path = await globalFile($)
  if (path === undefined) {
    return 'No home folder to keep grammar.json in.'
  }
  let file: Record<string, unknown> = {}
  if (await $.fs.exists(path)) {
    try {
      file = JSON.parse(String(await $.fs.read(path))) as Record<string, unknown>
      parseLists(JSON.stringify(file))
    } catch (err) {
      return `${path} does not parse (${message(err)}), so it was left as it is. Fix it by hand.`
    }
  }
  const current = parseLists(JSON.stringify(file)).ignore
  const lower = new Set(entries.map(w => w.toLowerCase()))
  const next = op === 'add' ? [...new Set([...current, ...entries])] : current.filter(w => !lower.has(w.toLowerCase()))
  await $.fs.write(path, `${JSON.stringify({ ...file, ignore: next }, null, 2)}\n`)
  const list = entries.map(w => JSON.stringify(w)).join(', ')
  return op === 'add' ? `Never flagged now: ${list}. Kept in ${path}.` : `Flagged again: ${list}. Kept in ${path}.`
}

const showLists = async ($: EngineInterface) => {
  const files = [await globalFile($), await projectFile($).catch(() => undefined)].filter((p): p is string => p !== undefined)
  const lines: string[] = []
  for (const path of [...new Set(files)]) {
    const lists = await readLists($, path)
    const ignore = lists.ignore.length > 0 ? lists.ignore.join(', ') : 'none'
    const skip = lists.skip.length > 0 ? lists.skip.join(', ') : 'none'
    lines.push(`${path}\n  ignore: ${ignore}\n  skip: ${skip}`)
  }
  return lines.join('\n')
}

export const register: Register = (on, options) => {
  const s = settingsFrom(options)
  const ICON = s.icons ? NERD_ICONS : PLAIN_ICONS

  on('session.start', async ($, e, next) => {
    const moved = await migrate($).catch(() => ({}) as Record<string, boolean>)
    await update($, isOn, () => moved.enabled ?? s.enabled)
    await update($, isNatural, () => moved.natural ?? s.natural)
    await $.command.register({
      name: 'grammar',
      description: 'The English check of your prompts: /grammar on|off, /grammar natural on|off, /grammar ignore add|rm <words>, /grammar help',
      argumentHint: '[help|on|off|natural|ignore]',
    })

    return next(e)
  })

  on('command.run', { command: 'grammar' }, async ($, e) => {
    const [first = '', ...rest] = e.args.trim().split(/\s+/)
    const sub = (rest[0] ?? '').toLowerCase()
    switch (first.toLowerCase()) {
      case 'help':
      case '?': {
        const enabled = await read($, isOn)
        const paused = (await read($, fails)) >= MAX_FAILS
        const check = !enabled ? 'off' : paused ? `paused after ${MAX_FAILS} failures (/grammar on resumes)` : 'on'
        const now = [
          `Check: ${check}. Natural line: ${(await read($, isNatural)) ? 'on' : 'off'}.`,
          `Model: ${s.model}, effort ${s.effort}, spelling ${s.dialect}, at least ${s.minWords} words, up to ${s.maxChars} characters.`,
        ]
        return { text: `${now.join('\n')}\n\n${USAGE}` }
      }
      case 'natural': {
        if (sub !== '' && sub !== 'on' && sub !== 'off') {
          return { text: USAGE }
        }
        const natural = sub === 'on' ? true : sub === 'off' ? false : !(await read($, isNatural))
        await update($, isNatural, () => natural)
        const why = await persist($, 'natural', natural)
        return {
          text:
            (natural
              ? 'Natural phrasing on: the check also says when a native speaker would put it differently.'
              : 'Natural phrasing off: grammar fixes only.') + sessionOnly(why),
        }
      }
      case 'ignore': {
        const words = entriesFrom(rest.slice(1).join(' '))
        if (sub === '' || sub === 'list') {
          return { text: await showLists($) }
        }
        if ((sub === 'add' || sub === 'rm') && words.length > 0) {
          return { text: await editIgnore($, sub, words) }
        }
        return { text: USAGE }
      }
      case '':
      case 'on':
      case 'off': {
        const want = first === 'on' ? true : first === 'off' ? false : !(await read($, isOn))
        await update($, isOn, () => want)
        if (want) {
          await update($, fails, () => 0)
        }
        const why = await persist($, 'enabled', want)
        return {
          text: (want ? `English check on: ${s.model} checks each prompt you send.` : 'English check off.') + sessionOnly(why),
        }
      }
      default:
        return { text: USAGE }
    }
  })

  // Only prompts with Latin letters can be English.
  on('prompt.submit', { text: /[A-Za-z]{2}/ }, async ($, e, next) => {
    // A failed check must never hold up the prompt.
    await queue($, s, e).catch(() => undefined)

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
      const paused = c.paused ? `; paused after ${MAX_FAILS} failures in a row, /grammar on to try again` : ''
      lines.push(
        <Box key="gr-error">
          <Text dimColor wrap="truncate-end">
            {`${ICON.error} no grammar check: ${c.error ?? 'unknown'}${paused}`}
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
                {s.showWhy && f.why !== '' && <Text dimColor>{` ${f.why}`}</Text>}
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
