import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { applyFixes, compileIgnore, compileSkip, cut, entriesFrom, mergeLists, parseLists, settingsFrom, wordCount } from '../hooks/config'
import { checkFor, keepFixes, parseReply, system, typedPart, usefulNatural } from '../hooks/grammar'

const FIXES = {
  english: true,
  fixes: [
    { from: 'appea', to: 'appear', why: 'typo' },
    { from: 'about', to: 'above', why: 'wrong word' },
  ],
}

const HOME_FILE = '/home/u/.claude/grammar.json'
const PROJECT_FILE = '/work/app/.claude/grammar.json'

/** The transcript row of a prompt you typed. */
const mountRow = ($: Engine, text: string, kind = 'composer') =>
  $.ui.mount({
    plugin: 'grammar',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text, origin: { kind }, isExpanded: false } as never,
  })

/** A home folder, a project and the files in them; returns the files, written ones included. */
const disk = (on: On, initial: Record<string, string> = {}) => {
  const files = new Map(Object.entries(initial))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }) as never)
  on('session.root', () => ({ value: '/work/app' }) as never)
  on('fs.exists', ($, e) => ({ value: files.has(e.path) }) as never)
  on('fs.read', ($, e) => {
    const text = files.get(e.path)
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }
    return { value: text } as never
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined } as never
  })
  return files
}

/** The engine beneath: passes prompts on, draws an empty row, and draws in the terminal unless `surfaces` says otherwise. */
const engine = (on: On, surfaces: string[] = ['terminal'], files: Record<string, string> = {}, stored: Record<string, unknown> = {}) => {
  mock.store(on, stored)
  const written = disk(on, files)
  on('session.start', () => ({ cwd: '/work/app' }) as never)
  on('command.register', () => ({ value: { command: 'grammar' } }) as never)
  on('session.surfaces', () => ({ value: surfaces }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box', props: { key: 'prompt' }, children: [] }) as never)
  return written
}

type Asked = { prompts: string[]; systems: string[]; models: string[]; files: Map<string, string> }

/** The model beneath the plugin: answers `reply` (a function of the call's number, or one value), and records what it was asked. */
const haiku = (on: On, reply: unknown, surfaces?: string[], files?: Record<string, string>, stored?: Record<string, unknown>): Asked => {
  const asked: Asked = { prompts: [], systems: [], models: [], files: new Map() }
  on('model.complete', ($, e) => {
    const p = e.prompt as string | readonly { text: string }[]
    asked.prompts.push(typeof p === 'string' ? p : p.map(b => b.text).join(''))
    asked.systems.push(String(e.system))
    asked.models.push(e.model)
    const r = typeof reply === 'function' ? (reply as (n: number) => unknown)(asked.prompts.length) : reply
    return {
      value: {
        isAnswered: true,
        text: typeof r === 'string' ? r : JSON.stringify(r),
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    } as never
  })
  asked.files = engine(on, surfaces, files, stored)
  return asked
}

const TYPO = 'it should appea somewhere about the prompt'

test('the fixes show under the prompt in the transcript once the model answers', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, { ...FIXES, natural: 'it should show up just above the prompt' })
  await $.prompt.submit({ text: TYPO } as never)

  const checking = await mountRow($, TYPO)
  expect(await checking.find({ key: 'prompt' })).toBeDefined()
  expect(await checking.find({ key: 'gr-fixes' })).toBeUndefined()

  await clock.advance(5)
  expect(asked.prompts).toEqual([TYPO])
  expect(asked.models).toEqual(['haiku'])
  const row = await mountRow($, TYPO)
  expect(await row.find({ key: 'prompt' })).toBeDefined()
  const fixes = (await row.find({ key: 'gr-fixes' }))?.text ?? ''
  expect(fixes).toContain('appea')
  expect(fixes).toContain('appear')
  expect(fixes).toContain('wrong word')
  expect((await row.find({ key: 'gr-natural' }))?.text).toContain('it should show up just above the prompt')

  // Other prompts and other kinds of rows are left alone.
  expect(await (await mountRow($, 'something else')).find({ key: 'grammar' })).toBeUndefined()
  expect(await (await mountRow($, TYPO, 'task-notification')).find({ key: 'grammar' })).toBeUndefined()
})

test('each prompt keeps its own fixes, and a longer prompt never takes a shorter one\'s', async ($, on) => {
  const clock = mock.clock(on)
  haiku(on, (n: number) => (n === 1 ? FIXES : { english: true, fixes: [] }))
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  await $.prompt.submit({ text: `${TYPO} and more` } as never)
  await clock.advance(5)
  expect(await (await mountRow($, TYPO)).find({ key: 'gr-fixes' })).toBeDefined()
  expect(await (await mountRow($, `${TYPO} and more`)).find({ key: 'grammar' })).toBeUndefined()
})

test('clean English and other languages add nothing to the row', async ($, on) => {
  const clock = mock.clock(on)
  let reply: unknown = { english: true, fixes: [] }
  haiku(on, () => reply)

  await $.prompt.submit({ text: 'looks good to me' } as never)
  await clock.advance(5)
  expect(await (await mountRow($, 'looks good to me')).find({ key: 'grammar' })).toBeUndefined()

  reply = { english: false, fixes: [] }
  await $.prompt.submit({ text: 'das ist gut so' } as never)
  await clock.advance(5)
  expect(await (await mountRow($, 'das ist gut so')).find({ key: 'grammar' })).toBeUndefined()
})

test('a failed check says so in one dim line', async ($, on) => {
  const clock = mock.clock(on)
  haiku(on, 'sorry, no')
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(await (await mountRow($, TYPO)).find({ key: 'gr-error' })).toBeDefined()
})

test('three failures in a row pause the checks until /grammar on', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, 'sorry, no')
  for (const n of [1, 2, 3]) {
    await $.prompt.submit({ text: `prompt number ${n} here` } as never)
    await clock.advance(5)
  }
  expect((await (await mountRow($, 'prompt number 3 here')).find({ key: 'gr-error' }))?.text).toContain('paused')
  await $.prompt.submit({ text: 'prompt number 4 here' } as never)
  await clock.advance(5)
  expect(asked.prompts.length).toBe(3)

  await $.command.run({ command: 'grammar', args: 'on' } as never)
  await $.prompt.submit({ text: 'prompt number 5 here' } as never)
  await clock.advance(5)
  expect(asked.prompts.length).toBe(4)
})

test('turned off, nothing is checked', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.command.run({ command: 'grammar', args: 'off' } as never)
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked.prompts.length).toBe(0)
  expect(await (await mountRow($, TYPO)).find({ key: 'grammar' })).toBeUndefined()
})

test('turned off in the settings, nothing is checked', { options: { enabled: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.session.start({} as never)
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked.prompts.length).toBe(0)
})

test('/grammar on|off saves the setting through /config', async ($, on) => {
  const sets: unknown[] = []
  on('config.set', ($, e) => {
    sets.push({ key: e.key, value: e.value })
    return { value: e.value } as never
  })
  mock.store(on)
  const off = await $.command.run({ command: 'grammar', args: 'off' } as never)
  expect(off.text).toBe('English check off.')
  const toggled = await $.command.run({ command: 'grammar', args: '' } as never)
  expect(toggled.text).toContain('English check on')
  expect(sets).toEqual([
    { key: 'grammar.enabled', value: false },
    { key: 'grammar.enabled', value: true },
  ])
})

test('a setting /config refuses still holds for the session, and says so', async ($, on) => {
  on('config.set', () => ({ deny: 'locked by policy' }) as never)
  mock.store(on)
  const off = await $.command.run({ command: 'grammar', args: 'off' } as never)
  expect(off.text).toContain('this session only: locked by policy')
})

test('the 1.0 switches move into the settings once', async ($, on) => {
  const sets: unknown[] = []
  on('config.set', ($, e) => {
    sets.push({ key: e.key, value: e.value })
    return { value: e.value } as never
  })
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES, undefined, undefined, { 'grammar.on': false, 'grammar.natural': true })
  await $.session.start({} as never)
  expect(sets).toEqual([{ key: 'grammar.enabled', value: false }])
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked.prompts.length).toBe(0)
  // The store keys are gone, so a second start moves nothing.
  await $.session.start({} as never)
  expect(sets.length).toBe(1)
})

test('/grammar with an unknown word prints the usage instead of toggling', async ($, on) => {
  mock.store(on)
  const r = await $.command.run({ command: 'grammar', args: 'of' } as never)
  expect(r.text).toContain('/grammar ignore add')
})

test('/grammar help lists the commands and what is on now', { options: { model: 'sonnet' } }, async ($, on) => {
  on('config.set', ($, e) => ({ value: e.value }) as never)
  mock.store(on)
  const help = await $.command.run({ command: 'grammar', args: 'help' } as never)
  expect(help.text).toContain('Check: on.')
  expect(help.text).toContain('Model: sonnet')
  expect(help.text).toContain('/grammar ignore add')

  await $.command.run({ command: 'grammar', args: 'off' } as never)
  expect((await $.command.run({ command: 'grammar', args: 'help' } as never)).text).toContain('Check: off.')
})

test('a run that draws nowhere (claude -p) asks the model nothing', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES, [])
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked.prompts).toEqual([])
})

test('prompts under the minimum words are not checked', { options: { min_words: 3 } }, async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.prompt.submit({ text: 'ok go' } as never)
  await $.prompt.submit({ text: 'fix teh tests' } as never)
  await clock.advance(5)
  expect(asked.prompts).toEqual(['fix teh tests'])
})

test('the settings reach the request and the row', { options: { model: 'sonnet', dialect: 'uk', show_why: false, icons: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked.models).toEqual(['sonnet'])
  expect(asked.systems[0]).toContain('British English')
  expect(asked.systems[0]).not.toContain('"why"')
  const fixes = (await (await mountRow($, TYPO)).find({ key: 'gr-fixes' }))?.text ?? ''
  expect(fixes).toContain('appear')
  expect(fixes).not.toContain('wrong word')
  expect(fixes.startsWith('*')).toBe(true)
})

test('ignored words are told to the model and their fixes dropped; skipped prompts are not sent', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES, undefined, {
    [HOME_FILE]: JSON.stringify({ ignore: ['appea'] }),
    [PROJECT_FILE]: JSON.stringify({ ignore: ['/^ab.ut$/'], skip: ['^deploy '] }),
  })
  await $.prompt.submit({ text: TYPO } as never)
  await $.prompt.submit({ text: 'deploy it to staging pls' } as never)
  await clock.advance(5)
  expect(asked.prompts).toEqual([TYPO])
  expect(asked.systems[0]).toContain('"appea"')
  // Regex entries are matched locally only.
  expect(asked.systems[0]).not.toContain('ab.ut')
  expect(await (await mountRow($, TYPO)).find({ key: 'grammar' })).toBeUndefined()
})

test('a grammar.json that does not parse is reported once and the check goes on', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  const asked = haiku(on, FIXES, undefined, { [HOME_FILE]: '{ "ignore": [' })
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  await $.prompt.submit({ text: `${TYPO} again` } as never)
  await clock.advance(5)
  expect(asked.prompts.length).toBe(2)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain(HOME_FILE)
})

test('/grammar ignore add, rm and list edit the global file and keep the rest of it', async ($, on) => {
  const files = engine(on, ['terminal'], { [HOME_FILE]: JSON.stringify({ skip: ['^ok$'], ignore: ['kubectl'] }) })
  const added = await $.command.run({ command: 'grammar', args: 'ignore add pnpm, pull request' } as never)
  expect(added.text).toContain('"pull request"')
  expect(JSON.parse(files.get(HOME_FILE) ?? '{}')).toEqual({ skip: ['^ok$'], ignore: ['kubectl', 'pnpm', 'pull request'] })

  await $.command.run({ command: 'grammar', args: 'ignore rm KUBECTL' } as never)
  expect(JSON.parse(files.get(HOME_FILE) ?? '{}').ignore).toEqual(['pnpm', 'pull request'])

  const list = await $.command.run({ command: 'grammar', args: 'ignore' } as never)
  expect(list.text).toContain('pnpm, pull request')
  expect(list.text).toContain('^ok$')
})

test('/grammar ignore add leaves a file that does not parse alone', async ($, on) => {
  const files = engine(on, ['terminal'], { [HOME_FILE]: 'not json' })
  const r = await $.command.run({ command: 'grammar', args: 'ignore add pnpm' } as never)
  expect(r.text).toContain('does not parse')
  expect(files.get(HOME_FILE)).toBe('not json')
})

test('slash commands and sent answers are not checked', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.prompt.submit({ text: 'Answers to your questions:\n#1 ("Which port?"): 4222' } as never)
  await clock.advance(5)
  expect(asked.prompts).toEqual([])
})

test('answers appended by open-questions are not checked with the prompt', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  const sent = `${TYPO}\n\nAnswer to your question #1 ("Which port do you want?"): 4222`
  await $.prompt.submit({ text: sent } as never)
  await clock.advance(5)
  expect(asked.prompts).toEqual([TYPO])
  expect(await (await mountRow($, sent)).find({ key: 'gr-fixes' })).toBeDefined()
  expect(typedPart('Answers to your questions:\n#1 ("x"): y')).toBe('')
})

test('the reply is parsed, and a row finds its check even with text appended', () => {
  expect(parseReply('```json\n{"english": false, "fixes": []}\n```')).toBeNull()
  const reply = parseReply(JSON.stringify(FIXES))
  expect(reply?.fixes.length).toBe(2)
  expect(reply?.natural).toBeNull()
  expect(parseReply('{"english": true, "fixes": [{"from": "a", "to": "b"}]}')?.fixes[0]?.why).toBe('')
  expect(() => parseReply('sorry, no')).toThrow()

  const all = [
    { id: 2, text: 'fix it', status: 'done' as const, fixes: [] },
    { id: 1, text: 'fix it', status: 'done' as const, fixes: FIXES.fixes },
  ]
  expect(checkFor(all, 'fix it\n\nAnswers to your questions: …')?.id).toBe(2)
  expect(checkFor(all, 'fix it now')).toBeUndefined()
  expect(checkFor(all, 'other')).toBeUndefined()
})

test('fixes for words the prompt does not hold, or that are ignored, are dropped', () => {
  const fixes = [...FIXES.fixes, { from: 'invented words', to: 'x', why: 'typo' }]
  expect(keepFixes(fixes, TYPO, compileIgnore([])).map(f => f.from)).toEqual(['appea', 'about'])
  expect(keepFixes(fixes, TYPO, compileIgnore(['ABOUT'])).map(f => f.from)).toEqual(['appea'])
  expect(keepFixes(fixes, TYPO, compileIgnore(['/^app/'])).map(f => f.from)).toEqual(['about'])
  // A plain word matches whole words only.
  expect(keepFixes(fixes, TYPO, compileIgnore(['app'])).map(f => f.from)).toEqual(['appea', 'about'])
})

test('a natural rewrite is kept only when it says something new', () => {
  const reply = parseReply(JSON.stringify({ ...FIXES, natural: 'it should show up just above the prompt' }))
  expect(reply?.natural).toBe('it should show up just above the prompt')
  expect(applyFixes(TYPO, FIXES.fixes)).toBe('it should appear somewhere above the prompt')
  expect(usefulNatural('It should appear somewhere above the prompt.', TYPO, FIXES.fixes)).toBeNull()
  expect(usefulNatural('looks good', 'looks good', [])).toBeNull()
  expect(usefulNatural('the way I prompt', 'the way how i prompt', [])).toBe('the way I prompt')
  // It may not drop a word the user said to keep.
  expect(usefulNatural('run the cluster tool', 'run kubectl tool how', [], compileIgnore(['kubectl']))).toBeNull()
  expect(system({ natural: true })).toContain('"natural"')
  expect(system({ natural: false })).not.toContain('"natural"')
})

test('/grammar natural off hides the natural line and stops asking for it', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, { english: true, fixes: [], natural: 'the way I prompt' })

  await $.prompt.submit({ text: 'the way how i prompt' } as never)
  await clock.advance(5)
  expect(await (await mountRow($, 'the way how i prompt')).find({ key: 'gr-natural' })).toBeDefined()
  expect(asked.systems[0]).toContain('"natural"')

  const off = await $.command.run({ command: 'grammar', args: 'natural off' } as never)
  expect(off.text).toContain('Natural phrasing off')
  expect(await (await mountRow($, 'the way how i prompt')).find({ key: 'grammar' })).toBeUndefined()

  await $.prompt.submit({ text: 'the way how i prompt' } as never)
  await clock.advance(5)
  expect(asked.systems[1]).not.toContain('"natural"')
})

test('config helpers: settings, lists, words and cuts', () => {
  expect(settingsFrom({})).toEqual({
    enabled: true,
    natural: true,
    model: 'haiku',
    effort: 'low',
    dialect: 'any',
    minWords: 2,
    maxChars: 6000,
    icons: true,
    showWhy: true,
  })
  expect(settingsFrom({ effort: 'max', max_chars: 5, dialect: 'au' })).toMatchObject({ effort: 'low', maxChars: 200, dialect: 'any' })
  expect(parseLists('{"ignore": ["a", 3, ""], "other": 1}')).toEqual({ ignore: ['a'], skip: [] })
  expect(() => parseLists('[]')).toThrow()
  expect(mergeLists({ ignore: ['a'], skip: [] }, { ignore: ['a', 'b'], skip: ['x'] })).toEqual({ ignore: ['a', 'b'], skip: ['x'] })
  expect(compileSkip(['^ok$', '/(/', '/^Y/']).map(r => r.test('OK'))).toEqual([true, false])
  expect(wordCount("let's go, ok")).toBe(3)
  expect(cut('one two three four', 10)).toBe('one two')
  expect(entriesFrom('a b')).toEqual(['a', 'b'])
  expect(entriesFrom('pull request, pnpm')).toEqual(['pull request', 'pnpm'])
})
