// `why` is '' when the show_why setting is off.
export type GrammarFix = { from: string; to: string; why: string }
export type GrammarReply = { fixes: GrammarFix[]; natural: string | null }
export type GrammarCheck = {
  id: number
  // The prompt as typed, trimmed.
  text: string
  status: 'checking' | 'done' | 'error'
  fixes: GrammarFix[]
  // How a native speaker would say it, when the phrasing is clearly off.
  natural?: string | null
  error?: string
  // This failure paused the checks: too many in a row.
  paused?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    grammar: {
      grammarOn: boolean
      grammarNatural: boolean
      grammarChecks: GrammarCheck[]
      grammarLastId: number
      // Failed checks in a row; at MAX_FAILS the checks pause until /grammar on.
      grammarFails: number
    }
  }
}
