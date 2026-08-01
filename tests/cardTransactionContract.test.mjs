import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_CARD_TRANSACTION_PUBLIC_FIELDS,
  appendAdminCardTransactionPage,
  cardTransactionCollectionScope,
  cardTransactionDetailScope,
  cardTransactionRequestScope,
  createCardTransactionFeed,
  MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE,
  MAX_CARD_TRANSACTION_JSON_BYTES,
  MAX_CARD_TRANSACTION_JSON_DEPTH,
  parseAdminCardTransactionDetail,
  parseAdminCardTransactionPage,
} from '../src/cardTransactionContract.ts'
import { cardWorkspaceRequestScope } from '../src/cardWorkspaceContract.ts'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  createRequestGate,
  replaceRequestAbort,
  syncRequestScope,
} from '../src/requestGeneration.ts'

const query = { status: 'SETTLED', type: 'SETTLEMENT', currency: 'USD', from: '2026-07-01', to: '2026-07-31', limit: 25 }
const allQuery = { status: 'ALL', limit: 25 }
const wire = (value) => JSON.stringify(value)
const backendCursor = (id) => Buffer.from(JSON.stringify({
  v: 1,
  s: 'a'.repeat(64),
  i: id,
  m: 'b'.repeat(43),
})).toString('base64url')
const transaction = (id = 'txn-2', occurredAt = '2026-07-31T10:00:00.000Z', patch = {}) => ({
  id,
  status: 'SETTLED',
  type: 'SETTLEMENT',
  amountMinor: '2500',
  authorizedAmountMinor: '2500',
  clearedAmountMinor: '2500',
  settledAmountMinor: '2500',
  reversedAmountMinor: '0',
  refundedAmountMinor: '0',
  currency: 'USD',
  merchantName: 'Public Merchant',
  merchantCategory: '5411',
  occurredAt,
  ...patch,
})

for (const environment of ['SANDBOX', 'TEST']) {
  test(`${environment} consumes exact 13-field Backend list and detail contracts`, () => {
    const cursor = backendCursor('txn-2')
    const page = parseAdminCardTransactionPage(wire({ data: [transaction()], nextCursor: cursor }), query)
    assert.deepEqual(Object.keys(page.transactions[0]), ADMIN_CARD_TRANSACTION_PUBLIC_FIELDS)
    assert.equal(page.nextCursor, cursor)
    assert.deepEqual(parseAdminCardTransactionDetail(wire(transaction()), 'txn-2', query), page.transactions[0])

    const listScope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', environment, 'card-1', query)
    const detailScope = cardTransactionDetailScope('admin-1', 'session-1', 'tenant-1', environment, 'card-1', query, 'txn-2')
    assert.notEqual(listScope, detailScope)
    assert.match(detailScope, /txn-2/)

    const gate = createRequestGate(listScope)
    const ticket = beginRequest(gate, listScope)
    assert.equal(acceptsMountedResponse(true, gate, ticket, listScope), true)
    assert.equal(acceptsMountedResponse(false, gate, ticket, listScope), false)
  })
}

test('ALL accepts the public Backend allowlist while exact filters fail closed', () => {
  for (const [status, type] of [
    ['AUTHORIZED', 'AUTHORIZATION'],
    ['DECLINED', 'DECLINE'],
    ['CLEARED', 'CLEARING'],
    ['SETTLED', 'SETTLEMENT'],
    ['REVERSED', 'REVERSAL'],
    ['REFUNDED', 'REFUND'],
  ]) {
    assert.equal(parseAdminCardTransactionPage(wire({
      data: [transaction(`txn-${status}`, '2026-07-31T10:00:00.000Z', { status, type })],
      nextCursor: null,
    }), allQuery).transactions[0].status, status)
  }
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction('txn-wrong', undefined, { status: 'DECLINED', type: 'DECLINE' })], nextCursor: null }), query), /could not be verified/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction('txn-currency', undefined, { currency: 'EUR' })], nextCursor: null }), query), /could not be verified/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction('txn-date', '2026-08-01T00:00:00.000Z')], nextCursor: null }), query), /could not be verified/)
})

test('exact page and transaction fields reject all internal/provider fields', () => {
  for (const internalField of ['cardId', 'providerTransactionId', 'traceId', 'journalIds', 'providerPayload', 'internal']) {
    assert.throws(() => parseAdminCardTransactionPage(wire({
      data: [transaction('txn-private', undefined, { [internalField]: 'private' })],
      nextCursor: null,
    }), allQuery), /could not be verified/)
  }
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction()], nextCursor: null, internal: true }), query), /could not be verified/)
  assert.throws(() => parseAdminCardTransactionDetail(wire({ ...transaction(), traceId: 'private' }), 'txn-2', query), /could not be verified/)
})

test('detail rejects wrong transaction ID and invalid requested IDs', () => {
  assert.throws(() => parseAdminCardTransactionDetail(wire(transaction('txn-other')), 'txn-2', query), /current Admin scope/)
  assert.throws(() => parseAdminCardTransactionDetail(wire(transaction()), '../txn-2', query), /could not be verified/)
  assert.throws(() => parseAdminCardTransactionDetail(wire(transaction('txn.dot')), 'txn.dot', allQuery), /could not be verified/)
})

test('page size, duplicate IDs, order and lifecycle mapping fail closed', () => {
  const tooMany = Array.from({ length: MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE + 1 }, (_, index) =>
    transaction(`txn-${100 - index}`, `2026-07-${String(31 - Math.floor(index / 2)).padStart(2, '0')}T${index % 2 ? '00' : '12'}:00:00.000Z`))
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: tooMany, nextCursor: null }), query), /exceeds the allowed size/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction(), transaction()], nextCursor: null }), query), /duplicate transaction/)
  assert.throws(() => parseAdminCardTransactionPage(wire({
    data: [transaction('txn-old', '2026-07-31T09:00:00.000Z'), transaction('txn-new', '2026-07-31T10:00:00.000Z')],
    nextCursor: null,
  }), query), /expected order/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction('txn-bad', undefined, { type: 'REFUND' })], nextCursor: null }), allQuery), /could not be verified/)
})

test('signed cursor pagination rejects duplicate IDs, mismatches and loops', () => {
  const scope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query)
  const cursor2 = backendCursor('txn-2')
  const cursor3 = backendCursor('txn-3')
  const firstPage = parseAdminCardTransactionPage(wire({ data: [transaction('txn-2')], nextCursor: cursor2 }), query)
  const first = appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, scope)
  const duplicate = parseAdminCardTransactionPage(wire({ data: [transaction('txn-2', '2026-07-31T09:00:00.000Z')], nextCursor: cursor3 }), query)
  assert.throws(() => appendAdminCardTransactionPage(first, duplicate, cursor2, scope), /duplicate transaction/)
  const loop = parseAdminCardTransactionPage(wire({ data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')], nextCursor: cursor2 }), query)
  assert.throws(() => appendAdminCardTransactionPage(first, loop, cursor2, scope), /cursor loop/)
  assert.throws(() => appendAdminCardTransactionPage(first, loop, cursor3, scope), /cursor does not match/)

  const malformed = Buffer.from(JSON.stringify({ v: 1, s: 'a'.repeat(64), i: 'txn-1', m: 'b'.repeat(43), extra: true })).toString('base64url')
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction()], nextCursor: malformed }), query), /could not be verified/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction()], nextCursor: 'opaque_cursor' }), query), /could not be verified/)
})

test('collection pagination rejects wrong Card/filter scope and preserves terminal pages', () => {
  const scope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query)
  const wrongCard = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-2', query)
  const wrongFilter = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', { ...query, status: 'ALL' })
  const cursor = backendCursor('txn-2')
  const firstPage = parseAdminCardTransactionPage(wire({ data: [transaction('txn-2')], nextCursor: cursor }), query)
  assert.throws(() => appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, wrongCard), /current Admin scope/)
  assert.throws(() => appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, wrongFilter), /current Admin scope/)
  const first = appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, scope)
  const finalPage = parseAdminCardTransactionPage(wire({ data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')], nextCursor: null }), query)
  assert.deepEqual(appendAdminCardTransactionPage(first, finalPage, cursor, scope).transactions.map(({ id }) => id), ['txn-2', 'txn-1'])
})

test('actor, tenant, environment, Card, filter, cursor, detail and generation bind late responses', () => {
  const first = cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, null)
  const changedScopes = [
    cardTransactionRequestScope('admin-2', 'session-1', 'tenant-1', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-2', 'tenant-1', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-2', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'SANDBOX', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-2', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', { ...query, status: 'ALL' }, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, backendCursor('txn-2')),
    cardTransactionDetailScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, 'txn-2'),
    cardWorkspaceRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card', 'card-1', 'read'),
  ]
  for (const changed of changedScopes) {
    const gate = createRequestGate(first)
    const ticket = beginRequest(gate, first)
    syncRequestScope(gate, changed)
    assert.equal(acceptsMountedResponse(true, gate, ticket, changed), false)
  }
  const gate = createRequestGate(first)
  const ticket = beginRequest(gate, first)
  assert.equal(acceptsMountedResponse(true, gate, ticket, first), true)
  assert.equal(acceptsMountedResponse(false, gate, ticket, first), false)
})

test('filter switch actively aborts the old request before replacing selection/cursor state', () => {
  const slot = { current: null }
  const first = replaceRequestAbort(slot)
  assert.equal(first.signal.aborted, false)
  const second = replaceRequestAbort(slot)
  assert.equal(first.signal.aborted, true)
  assert.equal(second.signal.aborted, false)
  abortCurrentRequest(slot)
  assert.equal(second.signal.aborted, true)
  assert.equal(slot.current, null)
})

test('bounded wire parser rejects oversized, deep, non-wire and empty-cursor adversarial payloads', () => {
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: null, internal: 'x'.repeat(MAX_CARD_TRANSACTION_JSON_BYTES) }), allQuery), /could not be verified/)
  let internal = 'leaf'
  for (let index = 0; index < MAX_CARD_TRANSACTION_JSON_DEPTH; index += 1) internal = { nested: internal }
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: null, internal }), allQuery), /could not be verified/)

  const traps = { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 }
  const proxy = new Proxy({ data: [], nextCursor: null }, {
    get(target, property, receiver) { traps.get += 1; return Reflect.get(target, property, receiver) },
    getPrototypeOf(target) { traps.getPrototypeOf += 1; return Reflect.getPrototypeOf(target) },
    ownKeys(target) { traps.ownKeys += 1; return Reflect.ownKeys(target) },
    getOwnPropertyDescriptor(target, property) { traps.getOwnPropertyDescriptor += 1; return Reflect.getOwnPropertyDescriptor(target, property) },
  })
  assert.throws(() => parseAdminCardTransactionPage(proxy, allQuery), /could not be verified/)
  assert.deepEqual(traps, { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 })
  assert.deepEqual(parseAdminCardTransactionPage(wire({ data: [], nextCursor: null }), allQuery), { transactions: [], nextCursor: null })
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: backendCursor('txn-2') }), allQuery), /could not be verified/)
})
