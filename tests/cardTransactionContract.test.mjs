import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendAdminCardTransactionPage,
  cardTransactionCollectionScope,
  cardTransactionRequestScope,
  createCardTransactionFeed,
  MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE,
  MAX_CARD_TRANSACTION_JSON_BYTES,
  MAX_CARD_TRANSACTION_JSON_DEPTH,
  parseAdminCardTransactionPage,
} from '../src/cardTransactionContract.ts'
import { cardWorkspaceRequestScope } from '../src/cardWorkspaceContract.ts'
import {
  acceptsMountedResponse,
  beginRequest,
  createRequestGate,
  syncRequestScope,
} from '../src/requestGeneration.ts'

const query = { status: 'SETTLED', type: 'SETTLEMENT', currency: 'USD', from: '2026-07-01', to: '2026-07-31', limit: 25 }
const wire = (value) => JSON.stringify(value)
const backendCursor = (id) => Buffer.from(JSON.stringify({
  v: 1,
  s: 'a'.repeat(64),
  i: id,
  m: 'b'.repeat(43),
})).toString('base64url')
const transaction = (id = 'txn-2', occurredAt = '2026-07-31T10:00:00.000Z') => ({
  id,
  cardId: 'card-1',
  providerTransactionId: `provider-${id}`,
  status: 'SETTLED',
  type: 'SETTLEMENT',
  amountMinor: '2500',
  authorizedAmountMinor: '2500',
  clearedAmountMinor: '2500',
  settledAmountMinor: '2500',
  reversedAmountMinor: '0',
  refundedAmountMinor: '0',
  currency: 'USD',
  traceId: `trace-${id}`,
  journalIds: [`journal-${id}`],
  merchantName: 'Public Merchant',
  merchantCategory: '5411',
  occurredAt,
  providerPayload: { authorization: 'provider-secret' },
  internal: { ledgerPosting: 'internal-secret' },
})

test('Card transaction page exposes only the independent public allowlist', () => {
  const cursor = backendCursor('txn-2')
  const page = parseAdminCardTransactionPage(wire({
    data: [transaction()],
    nextCursor: cursor,
    provider: 'THREDD',
    internal: { requestId: 'private-request' },
  }), 25)

  assert.deepEqual(page, {
    transactions: [{
      id: 'txn-2',
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
      occurredAt: '2026-07-31T10:00:00.000Z',
    }],
    nextCursor: cursor,
  })
  const serialized = JSON.stringify(page)
  for (const hidden of ['provider-txn-2', 'trace-txn-2', 'journal-txn-2', 'provider-secret', 'internal-secret', 'private-request', 'THREDD']) {
    assert.equal(serialized.includes(hidden), false)
  }
})

test('consumes the exact Backend public body and its long opaque cursor', () => {
  const cursor = backendCursor('txn_first')
  assert.equal(cursor.length > 128, true)
  assert.equal(cursor.length <= 512, true)
  assert.deepEqual(parseAdminCardTransactionPage(wire({
    data: [{
      id: 'txn_first',
      status: 'SETTLED',
      type: 'SETTLEMENT',
      amountMinor: '1250',
      authorizedAmountMinor: '1250',
      clearedAmountMinor: '1250',
      settledAmountMinor: '1250',
      reversedAmountMinor: '0',
      refundedAmountMinor: '0',
      currency: 'USD',
      merchantName: 'Public Store',
      merchantCategory: '5812',
      occurredAt: '2026-07-30T12:00:00.000Z',
    }],
    nextCursor: cursor,
  }), 1), {
    transactions: [{
      id: 'txn_first',
      status: 'SETTLED',
      type: 'SETTLEMENT',
      amountMinor: '1250',
      authorizedAmountMinor: '1250',
      clearedAmountMinor: '1250',
      settledAmountMinor: '1250',
      reversedAmountMinor: '0',
      refundedAmountMinor: '0',
      currency: 'USD',
      merchantName: 'Public Store',
      merchantCategory: '5812',
      occurredAt: '2026-07-30T12:00:00.000Z',
    }],
    nextCursor: cursor,
  })
})

test('page size, duplicate IDs, order and lifecycle type fail closed', () => {
  const tooMany = Array.from({ length: MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE + 1 }, (_, index) =>
    transaction(`txn-${100 - index}`, `2026-07-31T${String(23 - Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '00' : '30'}:00.000Z`))
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: tooMany, nextCursor: null }), 25), /exceeds the allowed size/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction(), transaction()], nextCursor: null }), 25), /duplicate transaction/)
  assert.throws(() => parseAdminCardTransactionPage(wire({
    data: [transaction('txn-old', '2026-07-31T09:00:00.000Z'), transaction('txn-new', '2026-07-31T10:00:00.000Z')],
    nextCursor: null,
  }), 25), /expected order/)
  assert.throws(() => parseAdminCardTransactionPage(wire({
    data: [{ ...transaction(), type: 'REFUND' }], nextCursor: null,
  }), 25), /could not be verified/)
})

test('pagination rejects cross-page duplicate IDs and cursor loops', () => {
  const scope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query)
  const cursor2 = backendCursor('txn-2')
  const cursor3 = backendCursor('txn-3')
  const firstPage = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-2', '2026-07-31T10:00:00.000Z')],
    nextCursor: cursor2,
  }), 25)
  const first = appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, scope)

  const duplicate = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-2', '2026-07-31T09:00:00.000Z')],
    nextCursor: cursor3,
  }), 25)
  assert.throws(() => appendAdminCardTransactionPage(first, duplicate, cursor2, scope), /duplicate transaction/)

  const cursorLoop = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')],
    nextCursor: cursor2,
  }), 25)
  assert.throws(() => appendAdminCardTransactionPage(first, cursorLoop, cursor2, scope), /cursor loop/)

  const secondPage = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')],
    nextCursor: cursor3,
  }), 25)
  const second = appendAdminCardTransactionPage(first, secondPage, cursor2, scope)
  const priorCursorLoop = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-0', '2026-07-31T08:00:00.000Z')],
    nextCursor: cursor2,
  }), 25)
  assert.throws(() => appendAdminCardTransactionPage(second, priorCursorLoop, cursor3, scope), /cursor loop/)
})

test('a Backend first page and terminal page append without losing scope', () => {
  const scope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query)
  const cursor = backendCursor('txn-2')
  const firstPage = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-2', '2026-07-31T10:00:00.000Z')], nextCursor: cursor,
  }), 25)
  const first = appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, scope)
  const finalPage = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')], nextCursor: null,
  }), 25)
  const complete = appendAdminCardTransactionPage(first, finalPage, cursor, scope)
  assert.deepEqual(complete.transactions.map(({ id }) => id), ['txn-2', 'txn-1'])
  assert.equal(complete.nextCursor, null)
})

test('scope, filters, cursor, action, generation and mounted state reject late responses', () => {
  const first = cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, null)
  const changedScopes = [
    cardTransactionRequestScope('admin-1', 'session-2', 'tenant-1', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-2', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'UAT', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-2', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', { ...query, status: 'DECLINED' }, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', { ...query, status: undefined, type: 'REFUND' }, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, backendCursor('txn-2')),
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

test('feed rejects a page after Card or Admin scope changes', () => {
  const scope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query)
  const changed = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-2', query)
  const page = parseAdminCardTransactionPage(wire({ data: [transaction()], nextCursor: null }), 25)
  assert.throws(() => appendAdminCardTransactionPage(createCardTransactionFeed(scope), page, null, changed), /current Admin scope/)
})

test('bounded wire parser rejects oversized, deep and non-wire adversarial payloads without Proxy traps', () => {
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: null, internal: 'x'.repeat(MAX_CARD_TRANSACTION_JSON_BYTES) }), 25), /could not be verified/)
  let internal = 'leaf'
  for (let index = 0; index < MAX_CARD_TRANSACTION_JSON_DEPTH; index += 1) internal = { nested: internal }
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: null, internal }), 25), /could not be verified/)

  const traps = { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 }
  const proxy = new Proxy({ data: [], nextCursor: null }, {
    get(target, property, receiver) { traps.get += 1; return Reflect.get(target, property, receiver) },
    getPrototypeOf(target) { traps.getPrototypeOf += 1; return Reflect.getPrototypeOf(target) },
    ownKeys(target) { traps.ownKeys += 1; return Reflect.ownKeys(target) },
    getOwnPropertyDescriptor(target, property) { traps.getOwnPropertyDescriptor += 1; return Reflect.getOwnPropertyDescriptor(target, property) },
  })
  assert.throws(() => parseAdminCardTransactionPage(proxy, 25), /could not be verified/)
  assert.deepEqual(traps, { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 })
})

test('empty pages are safe and cannot carry a next cursor', () => {
  assert.deepEqual(parseAdminCardTransactionPage(wire({ data: [], nextCursor: null }), 25), {
    transactions: [], nextCursor: null,
  })
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: backendCursor('txn-2') }), 25), /could not be verified/)
})
