import { expect, test } from 'claude-code/testing'

import { cacheLine, fromTranscript } from '../hooks/bar'

test('cold before the first request', async () => {
  expect(cacheLine(null, 0, '5m')).toBe(`${'░'.repeat(8)} cold`)
})

test('half the 5m TTL left fills half the bar', async () => {
  expect(cacheLine(0, 150_000, '5m')).toBe(`${'█'.repeat(4)}${'░'.repeat(4)} 2:30`)
})

test('1h TTL formats a full hour as minutes', async () => {
  expect(cacheLine(0, 1000, '1h')).toBe(`${'█'.repeat(8)} 59:59`)
})

test('expired once the TTL passes', async () => {
  expect(cacheLine(0, 300_001, '5m')).toBe(`${'░'.repeat(8)} expired`)
})

const row = (o: object) => JSON.stringify(o)

test('transcript gives the last main-thread response and its write TTL', async () => {
  const jsonl = [
    row({ type: 'assistant', timestamp: '2026-10-09T11:00:00.000Z', message: { usage: { cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 0 } } } }),
    row({ type: 'assistant', timestamp: '2026-10-09T11:05:00.000Z', message: { usage: { cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } } }),
    row({ type: 'assistant', isSidechain: true, timestamp: '2026-10-09T11:09:00.000Z', message: { usage: {} } }),
    '{"cut-off',
  ].join('\n')
  expect(fromTranscript(jsonl)).toEqual({ lastAt: Date.parse('2026-10-09T11:05:00.000Z'), ttl: '1h' })
})

test('a refresh time ahead of the clock draws a full bar', async () => {
  expect(cacheLine(1000, 0, '5m')).toBe(`${'█'.repeat(8)} 5:01`)
})

test('expired exactly at the TTL', async () => {
  expect(cacheLine(0, 300_000, '5m')).toBe(`${'░'.repeat(8)} expired`)
})

test('transcript reads a 5m write and skips unparseable timestamps', async () => {
  const jsonl = [
    row({ type: 'assistant', timestamp: '2026-10-09T11:00:00.000Z', message: { usage: { cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 5 } } } }),
    row({ type: 'assistant', timestamp: 'not a date', message: { usage: {} } }),
  ].join('\n')
  expect(fromTranscript(jsonl)).toEqual({ lastAt: Date.parse('2026-10-09T11:00:00.000Z'), ttl: '5m' })
})
