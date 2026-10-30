// The import's pure parts, apart from tools/import-history.ts (which runs as soon as it is loaded) so tests can use them.

// Per call: up to this many prompts, or this many characters, whichever comes first.
export const BATCH_PROMPTS = 20
export const BATCH_CHARS = 8000

export type Prompt = { id: number; text: string; at: number; cwd: string }

/** The text of a prompt line you typed (sent at once, or queued while Claude worked), or undefined for anything else. */
export const typedText = (line: string): { text: string; at: number; cwd: string; uuid: string } | undefined => {
  if (!line.includes('"promptSource":"typed"') && !line.includes('"promptSource":"queued"')) {
    return undefined
  }
  let e: Record<string, unknown>
  try {
    e = JSON.parse(line) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (e.type !== 'user' || e.isSidechain === true || e.isMeta === true || typeof e.timestamp !== 'string') {
    return undefined
  }
  const content = (e.message as { content?: unknown } | undefined)?.content
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map(b => ((b as { type?: string }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : '')).join('')
        : ''
  return { text: raw, at: Date.parse(e.timestamp), cwd: typeof e.cwd === 'string' ? e.cwd : '', uuid: String(e.uuid ?? '') }
}

/** Prompts grouped for one call each. */
export const batches = <P extends { text: string }>(prompts: readonly P[]) => {
  const out: P[][] = []
  let cur: P[] = []
  let chars = 0
  for (const p of prompts) {
    if (cur.length > 0 && (cur.length >= BATCH_PROMPTS || chars + p.text.length > BATCH_CHARS)) {
      out.push(cur)
      cur = []
      chars = 0
    }
    cur.push(p)
    chars += p.text.length
  }
  return cur.length > 0 ? [...out, cur] : out
}
