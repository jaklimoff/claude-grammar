import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { checkFor, parseReply, system, typedPart, usefulNatural } from '../hooks/grammar'

const FIXES = {
  english: true,
  fixes: [
    { from: 'appea', to: 'appear', why: 'typo', sentence: 'it should appear somewhere above the prompt' },
    { from: 'about', to: 'above', why: 'wrong word', sentence: 'it should appear somewhere above the prompt' },
  ],
}

/** The transcript row of a prompt you typed. */
const mountRow = ($: Engine, text: string, kind = 'composer') =>
  $.ui.mount({
    plugin: 'grammar',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text, origin: { kind }, isExpanded: false } as never,
  })

/** The engine beneath: passes prompts on, draws an empty row, and draws in the terminal unless `surfaces` says otherwise. */
const engine = (on: On, surfaces: string[] = ['terminal']) => {
  mock.store(on)
  on('session.surfaces', () => ({ value: surfaces }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box', props: { key: 'prompt' }, children: [] }) as never)
}

/** Haiku beneath the plugin: answers `reply`, and counts the prompts it was asked. */
const haiku = (on: On, reply: unknown, surfaces?: string[]) => {
  const asked: string[] = []
  on('model.complete', ($, e) => {
    const p = e.prompt as string | readonly { text: string }[]
    asked.push(typeof p === 'string' ? p : p.map(b => b.text).join(''))
    return {
      value: {
        isAnswered: true,
        text: typeof reply === 'string' ? reply : JSON.stringify(reply),
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    } as never
  })
  engine(on, surfaces)
  return asked
}

const TYPO = 'it should appea somewhere about the prompt'

test('the fixes show under the prompt in the transcript once Haiku answers', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, { ...FIXES, natural: 'it should show up just above the prompt' })
  await $.prompt.submit({ text: TYPO } as never)

  const checking = await mountRow($, TYPO)
  expect(await checking.find({ key: 'prompt' })).toBeDefined()
  expect(await checking.find({ key: 'gr-fixes' })).toBeUndefined()

  await clock.advance(5)
  expect(asked).toEqual([TYPO])
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

test('each prompt keeps its own fixes', async ($, on) => {
  const clock = mock.clock(on)
  haiku(on, FIXES)
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  await $.prompt.submit({ text: 'second appea one' } as never)
  await clock.advance(5)
  expect(await (await mountRow($, TYPO)).find({ key: 'gr-fixes' })).toBeDefined()
  expect(await (await mountRow($, 'second appea one')).find({ key: 'gr-fixes' })).toBeDefined()
})

test('clean English and other languages add nothing to the row', async ($, on) => {
  const clock = mock.clock(on)
  let reply: unknown = { english: true, fixes: [] }
  on('model.complete', () => ({ value: { isAnswered: true, text: JSON.stringify(reply), usage: { input_tokens: 1, output_tokens: 1 } } }) as never)
  engine(on)

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

test('turned off, nothing is checked', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.command.run({ command: 'grammar', args: 'off' } as never)
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked.length).toBe(0)
  expect(await (await mountRow($, TYPO)).find({ key: 'grammar' })).toBeUndefined()
})

test('a run that draws nowhere (claude -p) asks Haiku nothing', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES, [])
  await $.prompt.submit({ text: TYPO } as never)
  await clock.advance(5)
  expect(asked).toEqual([])
})

test('/grammar toggles the check', async ($, on) => {
  mock.store(on)
  const off = await $.command.run({ command: 'grammar', args: 'off' } as never)
  expect(off.text).toBe('English check off.')
  const toggled = await $.command.run({ command: 'grammar', args: '' } as never)
  expect(toggled.text).toContain('English check on')
})

test('slash commands and sent answers are not checked', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  await $.prompt.submit({ text: 'Answers to your questions:\n#1 ("Which port?"): 4222' } as never)
  await clock.advance(5)
  expect(asked).toEqual([])
})

test('answers appended by open-questions are not checked with the prompt', async ($, on) => {
  const clock = mock.clock(on)
  const asked = haiku(on, FIXES)
  const sent = `${TYPO}\n\nAnswer to your question #1 ("Which port do you want?"): 4222`
  await $.prompt.submit({ text: sent } as never)
  await clock.advance(5)
  expect(asked).toEqual([TYPO])
  expect(await (await mountRow($, sent)).find({ key: 'gr-fixes' })).toBeDefined()
  expect(typedPart('Answers to your questions:\n#1 ("x"): y')).toBe('')
})

test('the reply is parsed, and a row finds its check even with text appended', () => {
  expect(parseReply('```json\n{"english": false, "fixes": []}\n```')).toBeNull()
  const reply = parseReply(JSON.stringify(FIXES))
  expect(reply?.fixes.length).toBe(2)
  expect(reply?.natural).toBeNull()
  expect(() => parseReply('sorry, no')).toThrow()

  const all = [
    { id: 2, text: 'fix it', status: 'done' as const, fixes: [] },
    { id: 1, text: 'fix it', status: 'done' as const, fixes: FIXES.fixes },
  ]
  expect(checkFor(all, 'fix it\n\nAnswers to your questions: …')?.id).toBe(2)
  expect(checkFor(all, 'other')).toBeUndefined()
})

test('a natural rewrite is kept only when it says something new', () => {
  const reply = parseReply(JSON.stringify({ ...FIXES, natural: 'it should show up just above the prompt' }))
  expect(reply?.natural).toBe('it should show up just above the prompt')
  expect(usefulNatural('It should appear somewhere above the prompt', 'x', FIXES.fixes)).toBeNull()
  expect(usefulNatural('looks good', 'looks good', [])).toBeNull()
  expect(usefulNatural('the way I prompt', 'the way how i prompt', [])).toBe('the way I prompt')
  expect(system(true)).toContain('"natural"')
  expect(system(false)).not.toContain('"natural"')
})

test('/grammar natural off hides the natural line and stops asking for it', async ($, on) => {
  const clock = mock.clock(on)
  const systems: string[] = []
  on('model.complete', ($, e) => {
    systems.push(String(e.system))
    return {
      value: {
        isAnswered: true,
        text: JSON.stringify({ english: true, fixes: [], natural: 'the way I prompt' }),
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    } as never
  })
  engine(on)

  await $.prompt.submit({ text: 'the way how i prompt' } as never)
  await clock.advance(5)
  expect(await (await mountRow($, 'the way how i prompt')).find({ key: 'gr-natural' })).toBeDefined()
  expect(systems[0]).toContain('"natural"')

  const off = await $.command.run({ command: 'grammar', args: 'natural off' } as never)
  expect(off.text).toContain('Natural phrasing off')
  expect(await (await mountRow($, 'the way how i prompt')).find({ key: 'grammar' })).toBeUndefined()

  await $.prompt.submit({ text: 'the way how i prompt' } as never)
  await clock.advance(5)
  expect(systems[1]).not.toContain('"natural"')
})
