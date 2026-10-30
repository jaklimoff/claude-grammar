// Records the README's feature tour from docs/tour.html, frame by frame, into docs/tour-light.gif and docs/tour-dark.gif.
// The GIFs are not committed to main: commit them on the media branch, which the README links to.
//   bun docs/render-tour.ts            both cards
//   bun docs/render-tour.ts dark       one card
// Needs Google Chrome (or CHROME=/path/to/chrome), ffmpeg, and Hack Nerd Font Mono for the terminal text and icons.
// Open docs/tour.html in a browser to play and scrub the tour before recording.
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FPS = 15
const [W, H] = [1200, 750]
// GitHub's page colors, so the card's round corners blend into the README in each theme.
const CARDS = { light: 'ffffff', dark: '0d1117' } as const
type Card = keyof typeof CARDS

const wanted = (process.argv[2] ?? 'both') as Card | 'both'
if (wanted !== 'both' && !(wanted in CARDS)) {
  console.error('Usage: bun docs/render-tour.ts [light|dark|both]')
  process.exit(1)
}
const cards: Card[] = wanted === 'both' ? ['light', 'dark'] : [wanted]
const page = `file://${join(import.meta.dir, 'tour.html')}`

const profile = mkdtempSync(join(tmpdir(), 'tour-chrome-'))
const chrome = Bun.spawn(
  [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank'],
  { stdout: 'ignore', stderr: 'ignore' },
)

/** Waits until fn returns something other than undefined, or fails after ms. */
const until = async <T>(fn: () => Promise<T | undefined> | T | undefined, ms: number, what: string): Promise<T> => {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v !== undefined) return v
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`)
    await Bun.sleep(100)
  }
}

try {
  // Chrome writes its DevTools port into the profile once it is up.
  const portFile = join(profile, 'DevToolsActivePort')
  const port = await until(() => (existsSync(portFile) ? readFileSync(portFile, 'utf8').split('\n')[0] || undefined : undefined), 15000, 'Chrome')
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
  const target = targets.find(t => t.type === 'page')
  if (target === undefined) throw new Error('Chrome opened no page')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
  let nextId = 0
  const waiting = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>()
  ws.onmessage = m => {
    const msg = JSON.parse(String(m.data))
    const w = msg.id === undefined ? undefined : waiting.get(msg.id)
    if (w === undefined) return
    waiting.delete(msg.id)
    msg.error ? w.fail(new Error(msg.error.message)) : w.ok(msg.result)
  }
  const send = (method: string, params: object = {}) =>
    new Promise<any>((ok, fail) => {
      const id = ++nextId
      waiting.set(id, { ok, fail })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

  for (const card of cards) {
    await send('Page.navigate', { url: 'about:blank' })
    await send('Page.navigate', { url: `${page}#capture,card=${card},bg=${CARDS[card]}` })
    await until(async () => ((await evaluate('document.body?.dataset.ready')) === '1' ? true : undefined), 20000, 'the tour to load')
    const total = (await evaluate('window.TOUR.total')) as number
    const frames = Math.round(total * FPS)

    const dir = mkdtempSync(join(tmpdir(), `tour-${card}-`))
    for (let i = 0; i < frames; i++) {
      await evaluate(`renderAt(${i / FPS})`)
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'))
      if (i % FPS === 0) process.stdout.write(`\r${card}: ${i}/${frames} frames`)
    }
    process.stdout.write(`\r${card}: ${frames}/${frames} frames\n`)

    // One palette for the whole tour; only the changed rectangle of each frame is stored.
    const out = join(import.meta.dir, `tour-${card}.gif`)
    const ff = Bun.spawnSync([
      'ffmpeg', '-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f%05d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      '-loop', '0', out,
    ])
    if (ff.exitCode !== 0) throw new Error(`ffmpeg failed: ${ff.stderr.toString()}`)
    rmSync(dir, { recursive: true, force: true })
    console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB, ${total.toFixed(1)} s`)
  }
  ws.close()
} finally {
  chrome.kill()
  await chrome.exited
  rmSync(profile, { recursive: true, force: true })
}
