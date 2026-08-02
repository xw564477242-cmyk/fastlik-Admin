import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_ADMIN_CARD_TIMELINE_ITEMS,
  appendAdminCardTimelinePage,
  cardTimelineCollectionScope,
  cardTimelineRequestScope,
  cardTimelineSessionReadAllowed,
  cardTimelineShouldClearSnapshot,
  cardTimelineShouldInvalidateSession,
  createAdminCardTimelineFeed,
  parseAdminCardTimelinePage,
} from '../src/cardTimelineContract.ts'

const cursor = (id = 'evt-2', kind = 'EVENT', time = '2026-07-31T00:00:00.000Z') => `${Buffer.from(JSON.stringify({
  v: 1, t: time, k: kind, i: id,
})).toString('base64url')}.${Buffer.alloc(32, 1).toString('base64url')}`

const event = (id = 'evt-1', occurredAt = '2026-07-31T00:00:00.000Z', patch = {}) => ({
  id,
  type: 'FROZEN',
  fromStatus: 'ACTIVE',
  toStatus: 'FROZEN',
  occurredAt,
  ...patch,
})

const wire = (events, nextCursor = null, patch = {}) => JSON.stringify({ events, nextCursor, ...patch })

test('exact Backend page yields only the five public event fields', () => {
  const parsed = parseAdminCardTimelinePage(wire([event()]))
  assert.deepEqual(parsed, { events: [event()], nextCursor: null })
  assert.deepEqual(Object.keys(parsed.events[0]).sort(), ['fromStatus', 'id', 'occurredAt', 'toStatus', 'type'])
})

test('page and event fields are exact and Provider/internal payloads fail closed', () => {
  for (const value of [
    wire([event('evt-1', undefined, { provider: 'THREDD' })]),
    wire([event('evt-1', undefined, { payload: { pan: '4111111111111111' } })]),
    wire([event('evt-1', undefined, { actorId: 'admin-private' })]),
    wire([event('evt-1', undefined, { cardId: 'card-private' })]),
    wire([event()], null, { internal: true }),
  ]) assert.throws(() => parseAdminCardTimelinePage(value), /could not be verified/)
})

test('invalid scalar types, IDs, timestamps and page sizes fail closed', () => {
  for (const value of [
    wire([event('x')]),
    wire([event('evt-1', undefined, { type: 'PROVIDER_RAW' })]),
    wire([event('evt-1', undefined, { fromStatus: 'UNKNOWN' })]),
    wire([event('evt-1', '2026-07-31T00:00:00Z')]),
    wire(Array.from({ length: 26 }, (_, index) => event(`evt-${index + 10}`, `2026-07-30T23:${String(59 - index).padStart(2, '0')}:00.000Z`))),
  ]) assert.throws(() => parseAdminCardTimelinePage(value), /could not be verified|exceeds/)
})

test('duplicate and non-monotonic events fail closed within and across pages', () => {
  assert.throws(() => parseAdminCardTimelinePage(wire([event(), event()])), /duplicate/)
  assert.throws(() => parseAdminCardTimelinePage(wire([
    event('evt-1', '2026-07-31T00:00:00.000Z'),
    event('evt-2', '2026-07-31T00:01:00.000Z'),
  ])), /expected order/)

  const scope = cardTimelineCollectionScope('admin-1', '2099-01-01T00:00:00.000Z', 'tenant-1', 'TEST', 'card-1', 'token-marker-a')
  const firstCursor = cursor('evt-1')
  let feed = appendAdminCardTimelinePage(
    createAdminCardTimelineFeed(scope),
    parseAdminCardTimelinePage(wire([event('evt-1', '2026-07-31T00:00:00.000Z')], firstCursor)),
    null,
    scope,
  )
  assert.throws(() => appendAdminCardTimelinePage(feed, parseAdminCardTimelinePage(wire([event('evt-1', '2026-07-30T23:59:00.000Z')])), firstCursor, scope), /duplicate/)
  assert.throws(() => appendAdminCardTimelinePage(feed, parseAdminCardTimelinePage(wire([event('evt-3', '2026-07-31T00:01:00.000Z')])), firstCursor, scope), /expected order/)
})

test('signed cursors, request cursor, scope and cursor chain are verified', () => {
  const scope = cardTimelineCollectionScope('admin-1', '2099-01-01T00:00:00.000Z', 'tenant-1', 'SANDBOX', 'card-1', 'token-marker-a')
  const firstCursor = cursor('evt-1')
  let feed = appendAdminCardTimelinePage(createAdminCardTimelineFeed(scope), parseAdminCardTimelinePage(wire([event()], firstCursor)), null, scope)
  assert.equal(feed.nextCursor, firstCursor)
  assert.throws(() => appendAdminCardTimelinePage(feed, parseAdminCardTimelinePage(wire([event('evt-2', '2026-07-30T23:59:00.000Z')])), null, scope), /cursor does not match/)
  assert.throws(() => appendAdminCardTimelinePage(feed, parseAdminCardTimelinePage(wire([event('evt-2', '2026-07-30T23:59:00.000Z')])), firstCursor, `${scope}-other`), /scope/)
  assert.throws(() => appendAdminCardTimelinePage(feed, parseAdminCardTimelinePage(wire([event('evt-2', '2026-07-30T23:59:00.000Z')], firstCursor)), firstCursor, scope), /cursor/)
  assert.throws(() => parseAdminCardTimelinePage(wire([event()], 'bad.cursor')), /could not be verified/)
  assert.throws(() => parseAdminCardTimelinePage(wire([event()], cursor('wrong-event'))), /cursor/)
  const wrongShape = `${Buffer.from(JSON.stringify({ v: 1, t: '2026-07-31T00:00:00.000Z', k: 'EVENT', i: 'evt-2', extra: true })).toString('base64url')}.${Buffer.alloc(32, 1).toString('base64url')}`
  assert.throws(() => parseAdminCardTimelinePage(wire([event()], wrongShape)), /could not be verified/)
})

test('client enforces ten pages and 250 events without following an eleventh cursor', () => {
  const scope = cardTimelineCollectionScope('admin-1', '2099-01-01T00:00:00.000Z', 'tenant-1', 'TEST', 'card-1', 'token-marker-a')
  let feed = createAdminCardTimelineFeed(scope)
  let requested = null
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const events = Array.from({ length: 25 }, (_, itemIndex) => {
      const ordinal = pageIndex * 25 + itemIndex
      return event(`evt-${String(ordinal + 10).padStart(3, '0')}`, new Date(Date.UTC(2026, 6, 31, 0, 0, 0) - ordinal * 1000).toISOString())
    })
    const next = cursor(events.at(-1).id, 'EVENT', events.at(-1).occurredAt)
    feed = appendAdminCardTimelinePage(feed, parseAdminCardTimelinePage(wire(events, next)), requested, scope)
    requested = feed.nextCursor
  }
  assert.equal(feed.events.length, MAX_ADMIN_CARD_TIMELINE_ITEMS)
  assert.equal(feed.pageCount, 10)
  assert.equal(feed.nextCursor, null)
  assert.equal(feed.truncated, true)
})

test('actor, session, token identity, tenant, environment and card are bound into collection/request scopes', () => {
  const base = ['admin-1', '2099-01-01T00:00:00.000Z', 'tenant-1', 'TEST', 'card-1', 'token-marker-a']
  const collection = cardTimelineCollectionScope(...base)
  assert.notEqual(collection, cardTimelineCollectionScope('admin-2', ...base.slice(1)))
  assert.notEqual(collection, cardTimelineCollectionScope(base[0], '2099-02-01T00:00:00.000Z', ...base.slice(2)))
  assert.notEqual(collection, cardTimelineCollectionScope(base[0], base[1], 'tenant-2', ...base.slice(3)))
  assert.notEqual(collection, cardTimelineCollectionScope(base[0], base[1], base[2], 'SANDBOX', ...base.slice(4)))
  assert.notEqual(collection, cardTimelineCollectionScope(...base.slice(0, 4), 'card-2', base[5]))
  assert.notEqual(collection, cardTimelineCollectionScope(...base.slice(0, 5), 'token-marker-b'))
  assert.notEqual(collection, cardTimelineRequestScope(...base))
})

test('only unexpired SANDBOX and TEST Admin sessions may read timeline', () => {
  const future = '2099-01-01T00:00:00.000Z'
  assert.equal(cardTimelineSessionReadAllowed('admin-1', future, 'SANDBOX'), true)
  assert.equal(cardTimelineSessionReadAllowed('admin-1', future, 'TEST'), true)
  assert.equal(cardTimelineSessionReadAllowed('admin-1', future, 'UAT'), false)
  assert.equal(cardTimelineSessionReadAllowed('admin-1', future, 'PRODUCTION'), false)
  assert.equal(cardTimelineSessionReadAllowed('admin-1', '2020-01-01T00:00:00.000Z', 'TEST'), false)
  assert.equal(cardTimelineSessionReadAllowed('bad actor', future, 'TEST'), false)
})

test('only current authorization/scope terminal statuses clear a verified snapshot', () => {
  for (const status of [401, 403, 404]) assert.equal(cardTimelineShouldClearSnapshot({ status }), true)
  for (const status of [0, 400, 408, 409, 429, 500]) assert.equal(cardTimelineShouldClearSnapshot({ status }), false)
  assert.equal(cardTimelineShouldClearSnapshot(new Error('network')), false)

  let getterCalls = 0
  const accessor = {}
  Object.defineProperty(accessor, 'status', {
    get() { getterCalls += 1; return 401 },
  })
  assert.equal(cardTimelineShouldClearSnapshot(accessor), false)
  assert.equal(cardTimelineShouldInvalidateSession(accessor), false)
  assert.equal(getterCalls, 0)
})

test('only an own-data 401 requests matching-session invalidation', () => {
  assert.equal(cardTimelineShouldInvalidateSession({ status: 401 }), true)
  for (const status of [0, 400, 403, 404, 408, 409, 429, 500]) {
    assert.equal(cardTimelineShouldInvalidateSession({ status }), false)
  }
  assert.equal(cardTimelineShouldInvalidateSession(new Error('401')), false)
})

test('non-wire, oversized and deeply nested values fail closed', () => {
  assert.throws(() => parseAdminCardTimelinePage({ events: [], nextCursor: null }), /could not be verified/)
  assert.throws(() => parseAdminCardTimelinePage(JSON.stringify({ events: [], nextCursor: null, extra: 'x'.repeat(262_144) })), /could not be verified/)
  let nested = null
  for (let index = 0; index < 20; index += 1) nested = { nested }
  assert.throws(() => parseAdminCardTimelinePage(JSON.stringify({ events: [], nextCursor: null, nested })), /could not be verified/)
})
