export type Ttl = '5m' | '1h'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

const WIDTH = 8

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Status text for a cache last refreshed at `lastAt`; null `lastAt` means no request yet. */
export function cacheLine(lastAt: number | null, now: number, ttl: Ttl): string {
  if (lastAt === null) return `${'░'.repeat(WIDTH)} cold`
  const left = lastAt + TTL_MS[ttl] - now
  if (left <= 0) return `${'░'.repeat(WIDTH)} expired`
  const filled = Math.ceil((left / TTL_MS[ttl]) * WIDTH)
  return `${'█'.repeat(filled)}${'░'.repeat(WIDTH - filled)} ${clock(left)}`
}

export type TranscriptCache = { lastAt: number | null; ttl: Ttl | null }

/** Last main-thread response time and the TTL its cache was last written with, from transcript JSONL. */
export function fromTranscript(jsonl: string): TranscriptCache {
  const found: TranscriptCache = { lastAt: null, ttl: null }
  const lines = jsonl.split('\n')
  for (let i = lines.length - 1; i >= 0 && (found.lastAt === null || found.ttl === null); i--) {
    let row: any
    try {
      row = JSON.parse(lines[i] ?? '')
    } catch {
      continue
    }
    const usage = row?.message?.usage
    if (row?.type !== 'assistant' || row.isSidechain || !usage) continue
    if (found.lastAt === null && typeof row.timestamp === 'string') found.lastAt = Date.parse(row.timestamp)
    const written = usage.cache_creation
    if (found.ttl === null && written) {
      if (written.ephemeral_1h_input_tokens > 0) found.ttl = '1h'
      else if (written.ephemeral_5m_input_tokens > 0) found.ttl = '5m'
    }
  }
  return found
}
