import type { EngineInterface, Register } from 'claude-code'

import { cacheLine, fromTranscript, type Ttl } from './bar'

// The tail covers recent responses; the first line it cuts is skipped as unparseable.
const TAIL = `for f in "$HOME"/.claude/projects/*/"$1".jsonl; do tail -c 1048576 "$f"; break; done`

let lastAt: number | null = null
let override: Ttl | null = null
let seenTtl: Ttl | null = null
let envTtl: Ttl | null = null
let isSubscription = false

// Fallback before any cache write is on record: 1h for subscriptions, 5m for API keys.
function ttl(): Ttl {
  return override ?? seenTtl ?? envTtl ?? (isSubscription ? '1h' : '5m')
}

// Transcript timestamps mark when a response was written, a little after its request started.
async function readTranscript($: EngineInterface): Promise<void> {
  const ran = await $.process.run(['sh', '-c', TAIL, 'sh', await $.session.id()])
  if (ran.exitCode !== 0) return
  const found = fromTranscript(ran.stdout)
  if (found.lastAt !== null && (lastAt === null || found.lastAt > lastAt)) lastAt = found.lastAt
  if (found.ttl !== null) seenTtl = found.ttl
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (await $.env.get('FORCE_PROMPT_CACHING_5M')) envTtl = '5m'
    else if (await $.env.get('ENABLE_PROMPT_CACHING_1H')) envTtl = '1h'

    await $.command.register({
      name: 'cache-ttl',
      description: 'Set the prompt cache TTL the cache bar assumes: 5m, 1h or auto',
    })

    await readTranscript($).catch(() => {})

    const tick = async () => $.ui.status(cacheLine(lastAt, await $.clock.now(), ttl()))
    $.clock.every(1000, () => void tick())
    await tick()

    return next(e)
  })

  on('command.run', { command: 'cache-ttl' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '5m' || arg === '1h') override = arg
    else if (arg === 'auto' || arg === '') override = null
    else return { text: `Unknown TTL "${arg}". Use 5m, 1h or auto.` }

    return { text: `Cache bar assumes a ${ttl()} TTL${override ? '' : ' (auto)'}.` }
  })

  on('session.measure', ($, e, next) => {
    isSubscription = e.rateLimits.length > 0

    return next(e)
  })

  // The cache lifetime restarts at the start of each request that reads or writes the prefix.
  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage !== null) lastAt = startedAt

    return result
  })

  on('turn.complete', async ($, e, next) => {
    await readTranscript($).catch(() => {})

    return next(e)
  })

  on('session.end', ($, e, next) => {
    if (e.reason === 'clear') lastAt = null

    return next(e)
  })
}
