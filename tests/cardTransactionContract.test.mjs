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

const query = { status: 'SETTLED', currency: 'USD', from: '2026-07-01', to: '2026-07-31', limit: 25 }
const wire = (value) => JSON.stringify(value)
const transaction = (id = 'txn-2', occurredAt = '2026-07-31T10:00:00.000Z') => ({
  id,
  cardId: 'card-1',
  providerTransactionId: `provider-${id}`,
  status: 'SETTLED',
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
  createdAt: occurredAt,
  updatedAt: occurredAt,
  providerPayload: { authorization: 'provider-secret' },
  internal: { ledgerPosting: 'internal-secret' },
})

test('Card transaction page exposes only the independent public allowlist', () => {
  const page = parseAdminCardTransactionPage(wire({
    data: [transaction()],
    nextCursor: 'cursor-2',
    provider: 'THREDD',
    internal: { requestId: 'private-request' },
  }), 'card-1', 25)

  assert.deepEqual(page, {
    transactions: [{
      id: 'txn-2',
      status: 'SETTLED',
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
      createdAt: '2026-07-31T10:00:00.000Z',
      updatedAt: '2026-07-31T10:00:00.000Z',
    }],
    nextCursor: 'cursor-2',
  })
  const serialized = JSON.stringify(page)
  for (const hidden of ['provider-txn-2', 'trace-txn-2', 'journal-txn-2', 'provider-secret', 'internal-secret', 'private-request', 'THREDD']) {
    assert.equal(serialized.includes(hidden), false)
  }
})

test('page size, duplicate IDs, order and Card identity fail closed', () => {
  const tooMany = Array.from({ length: MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE + 1 }, (_, index) =>
    transaction(`txn-${100 - index}`, `2026-07-31T${String(23 - Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '00' : '30'}:00.000Z`))
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: tooMany, nextCursor: null }), 'card-1', 25), /exceeds the allowed size/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [transaction(), transaction()], nextCursor: null }), 'card-1', 25), /duplicate transaction/)
  assert.throws(() => parseAdminCardTransactionPage(wire({
    data: [transaction('txn-old', '2026-07-31T09:00:00.000Z'), transaction('txn-new', '2026-07-31T10:00:00.000Z')],
    nextCursor: null,
  }), 'card-1', 25), /expected order/)
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [{ ...transaction(), cardId: 'card-other' }], nextCursor: null }), 'card-1', 25), /requested Card ID/)
})

test('pagination rejects cross-page duplicate IDs and cursor loops', () => {
  const scope = cardTransactionCollectionScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query)
  const firstPage = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-2', '2026-07-31T10:00:00.000Z')],
    nextCursor: 'cursor-2',
  }), 'card-1', 25)
  const first = appendAdminCardTransactionPage(createCardTransactionFeed(scope), firstPage, null, scope)

  const duplicate = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-2', '2026-07-31T09:00:00.000Z')],
    nextCursor: 'cursor-3',
  }), 'card-1', 25)
  assert.throws(() => appendAdminCardTransactionPage(first, duplicate, 'cursor-2', scope), /duplicate transaction/)

  const cursorLoop = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')],
    nextCursor: 'cursor-2',
  }), 'card-1', 25)
  assert.throws(() => appendAdminCardTransactionPage(first, cursorLoop, 'cursor-2', scope), /cursor loop/)

  const secondPage = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-1', '2026-07-31T09:00:00.000Z')],
    nextCursor: 'cursor-3',
  }), 'card-1', 25)
  const second = appendAdminCardTransactionPage(first, secondPage, 'cursor-2', scope)
  const priorCursorLoop = parseAdminCardTransactionPage(wire({
    data: [transaction('txn-0', '2026-07-31T08:00:00.000Z')],
    nextCursor: 'cursor-2',
  }), 'card-1', 25)
  assert.throws(() => appendAdminCardTransactionPage(second, priorCursorLoop, 'cursor-3', scope), /cursor loop/)
})

test('scope, filters, cursor, action, generation and mounted state reject late responses', () => {
  const first = cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, null)
  const changedScopes = [
    cardTransactionRequestScope('admin-1', 'session-2', 'tenant-1', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-2', 'TEST', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'UAT', 'card-1', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-2', query, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', { ...query, status: 'DECLINED' }, null),
    cardTransactionRequestScope('admin-1', 'session-1', 'tenant-1', 'TEST', 'card-1', query, 'cursor-2'),
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
  const page = parseAdminCardTransactionPage(wire({ data: [transaction()], nextCursor: null }), 'card-1', 25)
  assert.throws(() => appendAdminCardTransactionPage(createCardTransactionFeed(scope), page, null, changed), /current Admin scope/)
})

test('bounded wire parser rejects oversized, deep and non-wire adversarial payloads without Proxy traps', () => {
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: null, internal: 'x'.repeat(MAX_CARD_TRANSACTION_JSON_BYTES) }), 'card-1', 25), /could not be verified/)
  let internal = 'leaf'
  for (let index = 0; index < MAX_CARD_TRANSACTION_JSON_DEPTH; index += 1) internal = { nested: internal }
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: null, internal }), 'card-1', 25), /could not be verified/)

  const traps = { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 }
  const proxy = new Proxy({ data: [], nextCursor: null }, {
    get(target, property, receiver) { traps.get += 1; return Reflect.get(target, property, receiver) },
    getPrototypeOf(target) { traps.getPrototypeOf += 1; return Reflect.getPrototypeOf(target) },
    ownKeys(target) { traps.ownKeys += 1; return Reflect.ownKeys(target) },
    getOwnPropertyDescriptor(target, property) { traps.getOwnPropertyDescriptor += 1; return Reflect.getOwnPropertyDescriptor(target, property) },
  })
  assert.throws(() => parseAdminCardTransactionPage(proxy, 'card-1', 25), /could not be verified/)
  assert.deepEqual(traps, { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 })
})

test('empty pages are safe and cannot carry a next cursor', () => {
  assert.deepEqual(parseAdminCardTransactionPage(wire({ data: [], nextCursor: null }), 'card-1', 25), {
    transactions: [], nextCursor: null,
  })
  assert.throws(() => parseAdminCardTransactionPage(wire({ data: [], nextCursor: 'cursor-2' }), 'card-1', 25), /could not be verified/)
})
