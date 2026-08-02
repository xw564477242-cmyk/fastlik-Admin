import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_CARD_WORKSPACE_JSON_BYTES,
  MAX_CARD_WORKSPACE_JSON_DEPTH,
  adminCardSnapshotFailurePolicy,
  adminCardSnapshotSessionScope,
  cardWorkspaceBaseScope,
  cardWorkspaceRequestScope,
  parseCardWorkspaceResponse,
  visibleCardWorkspaceState,
} from '../src/cardWorkspaceContract.ts'
import {
  acceptsResponse,
  beginRequest,
  createRequestGate,
  syncRequestScope,
} from '../src/requestGeneration.ts'

const sessionA = '2099-07-31T01:00:00.000Z'
const sessionB = '2099-07-31T02:00:00.000Z'
const wire = (value) => JSON.stringify(value)

const validCard = () => ({
  id: 'card-1',
  customerId: 'customer-1',
  environment: 'TEST',
  type: 'VIRTUAL',
  status: 'ACTIVE',
  maskedPan: '************4242',
  last4: '4242',
  expiryMonth: 12,
  expiryYear: 2030,
  currency: 'USD',
  alias: 'Travel',
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:01:00.000Z',
})

const validBalance = () => ({
  cardId: 'card-1',
  availableBalanceMinor: '1000',
  currentBalanceMinor: '1200',
  pendingAmountMinor: '-200',
  currency: 'USD',
  asOf: '2026-08-03T00:01:00.000Z',
})

const validLimits = () => ({
  cardId: 'card-1',
  singleTransactionMinor: '1000',
  dailySpendMinor: '5000',
  monthlySpendMinor: '50000',
  dailyAtmMinor: null,
  asOf: '2026-08-03T00:01:00.000Z',
})

test('scope mismatch hides old Card state on the first render before effects run', () => {
  const oldScope = cardWorkspaceBaseScope('admin-1', sessionA, 'tenant-a', 'TEST', 'card')
  const nextScope = cardWorkspaceBaseScope('admin-1', sessionA, 'tenant-b', 'UAT', 'history')
  const oldState = {
    cardId: 'card-private',
    view: { kind: 'CARD', value: { id: 'card-private', last4: '4242' }, empty: false, truncated: false },
    busy: 'read',
    error: 'old-scope error',
  }
  assert.deepEqual(visibleCardWorkspaceState(oldScope, nextScope, oldState), {
    cardId: '', view: null, busy: '', error: '',
  })
  assert.equal(visibleCardWorkspaceState(oldScope, oldScope, oldState), oldState)
})

test('session gate accepts only current home-tenant SANDBOX/TEST and binds exact session marker', () => {
  const now = Date.parse('2026-08-03T00:00:00.000Z')
  const sandbox = adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-1', 'SANDBOX', 'SANDBOX', 'marker-a', now)
  const testScope = adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-1', 'TEST', 'TEST', 'marker-a', now)
  assert.ok(sandbox)
  assert.ok(testScope)
  assert.notEqual(sandbox, adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-1', 'SANDBOX', 'SANDBOX', 'marker-b', now))
  for (const value of [
    adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-2', 'TEST', 'TEST', 'marker-a', now),
    adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-1', 'PRODUCTION', 'PRODUCTION', 'marker-a', now),
    adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-1', 'UAT', 'UAT', 'marker-a', now),
    adminCardSnapshotSessionScope('admin-1', sessionA, 'tenant-1', 'tenant-1', 'TEST', 'SANDBOX', 'marker-a', now),
    adminCardSnapshotSessionScope('admin-1', '2026-08-02T00:00:00.000Z', 'tenant-1', 'tenant-1', 'TEST', 'TEST', 'marker-a', now),
  ]) assert.equal(value, null)
})

test('tenant, environment, Card, action and request generation reject old completions', () => {
  const first = `${cardWorkspaceRequestScope('admin-1', sessionA, 'tenant-a', 'TEST', 'card', 'card-a', 'read')}\u0000marker-a`
  for (const next of [
    `${cardWorkspaceRequestScope('admin-1', sessionB, 'tenant-a', 'TEST', 'card', 'card-a', 'read')}\u0000marker-a`,
    `${cardWorkspaceRequestScope('admin-1', sessionA, 'tenant-b', 'TEST', 'card', 'card-a', 'read')}\u0000marker-a`,
    `${cardWorkspaceRequestScope('admin-1', sessionA, 'tenant-a', 'SANDBOX', 'card', 'card-a', 'read')}\u0000marker-a`,
    `${cardWorkspaceRequestScope('admin-1', sessionA, 'tenant-a', 'TEST', 'card', 'card-b', 'read')}\u0000marker-a`,
    `${cardWorkspaceRequestScope('admin-1', sessionA, 'tenant-a', 'TEST', 'card', 'card-a', 'balance')}\u0000marker-a`,
    `${cardWorkspaceRequestScope('admin-1', sessionA, 'tenant-a', 'TEST', 'card', 'card-a', 'read')}\u0000marker-b`,
  ]) {
    const gate = createRequestGate(first)
    const ticket = beginRequest(gate, first)
    syncRequestScope(gate, next)
    assert.equal(acceptsResponse(gate, ticket, next), false)
  }
})

test('detail snapshot accepts only the exact closed Backend DTO and expected environment', () => {
  const parsed = parseCardWorkspaceResponse('read', wire(validCard()), 'card-1', 'TEST')
  assert.deepEqual(parsed, { kind: 'CARD', value: validCard(), empty: false, truncated: false })
  assert.equal(Object.isFrozen(parsed.value), true)
  for (const malformed of [
    { ...validCard(), environment: 'SANDBOX' },
    { ...validCard(), id: 'card-other' },
    { ...validCard(), provider: 'THREDD' },
    { ...validCard(), providerPublicToken: 'secret' },
    { ...validCard(), maskedPan: '4111111111111111' },
    { ...validCard(), updatedAt: '2026-08-03T08:01:00+08:00' },
  ]) assert.throws(() => parseCardWorkspaceResponse('read', wire(malformed), 'card-1', 'TEST'), /could not be verified|does not match/)
})

test('balance and limits snapshots accept only their exact persisted DTOs', () => {
  assert.deepEqual(parseCardWorkspaceResponse('balance', wire(validBalance()), 'card-1', 'TEST'), {
    kind: 'BALANCE', value: validBalance(), empty: false, truncated: false,
  })
  assert.deepEqual(parseCardWorkspaceResponse('limits', wire(validLimits()), 'card-1', 'TEST'), {
    kind: 'LIMITS', value: validLimits(), empty: false, truncated: false,
  })
  assert.equal(parseCardWorkspaceResponse('limits', wire({ ...validLimits(), asOf: null }), 'card-1', 'TEST').value.asOf, null)
  for (const malformed of [
    { action: 'balance', value: { ...validBalance(), cardId: 'card-other' } },
    { action: 'balance', value: { ...validBalance(), availableBalanceMinor: 1000 } },
    { action: 'balance', value: { ...validBalance(), updatedAt: validBalance().asOf } },
    { action: 'limits', value: { ...validLimits(), dailySpendMinor: '-1' } },
    { action: 'limits', value: { ...validLimits(), version: 9 } },
  ]) assert.throws(() => parseCardWorkspaceResponse(malformed.action, wire(malformed.value), 'card-1', 'TEST'), /could not be verified|does not match/)
  assert.throws(
    () => parseCardWorkspaceResponse('balance', '{"cardId":"card-1","cardId":"card-other","availableBalanceMinor":"1","currentBalanceMinor":"1","pendingAmountMinor":"0","currency":"USD","asOf":"2026-08-03T00:01:00.000Z"}', 'card-1', 'TEST'),
    /could not be verified/,
  )
  assert.throws(
    () => parseCardWorkspaceResponse('limits', '{"cardId":"card-1","singleTransactionMinor":"1","dailySpendMinor":"1","monthlySpendMinor":"1","dailyAtmMinor":null,"asOf":null,"\u0061sOf":"2026-08-03T00:01:00.000Z"}', 'card-1', 'TEST'),
    /could not be verified/,
  )
})

test('only 401 invalidates the current Admin session and only transient failures retain snapshots', () => {
  assert.deepEqual(adminCardSnapshotFailurePolicy({ status: 401 }), { retainSnapshot: false, invalidateSession: true })
  for (const status of [0, 408, 500, 502, 503, 504]) {
    assert.deepEqual(adminCardSnapshotFailurePolicy({ status }), { retainSnapshot: true, invalidateSession: false })
  }
  for (const status of [400, 403, 404, 409, 429]) {
    assert.deepEqual(adminCardSnapshotFailurePolicy({ status }), { retainSnapshot: false, invalidateSession: false })
  }
  assert.deepEqual(adminCardSnapshotFailurePolicy(new Error('contract')), { retainSnapshot: false, invalidateSession: false })
  const accessor = Object.defineProperty({}, 'status', { get() { throw new Error('do not read') } })
  assert.deepEqual(adminCardSnapshotFailurePolicy(accessor), { retainSnapshot: false, invalidateSession: false })
})

test('Card timeline keeps its exact existing public page contract', () => {
  assert.deepEqual(parseCardWorkspaceResponse('history', wire({ events: [], nextCursor: null }), 'card-1'), {
    kind: 'TIMELINE', value: [], empty: true, truncated: false,
  })
  assert.throws(() => parseCardWorkspaceResponse('history', wire([{ provider: 'THREDD' }]), 'card-1'), /could not be verified/)
})

test('non-wire objects and Proxy payloads fail closed without property trap execution', () => {
  let getterCalls = 0
  const accessor = validCard()
  Object.defineProperty(accessor, 'providerPublicToken', {
    enumerable: true,
    get() { getterCalls += 1; return 'must-not-read' },
  })
  assert.throws(() => parseCardWorkspaceResponse('read', accessor, 'card-1', 'TEST'), /could not be verified/)
  assert.equal(getterCalls, 0)
  const traps = { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 }
  const proxy = new Proxy(validCard(), {
    get(target, property, receiver) { traps.get += 1; return Reflect.get(target, property, receiver) },
    getPrototypeOf(target) { traps.getPrototypeOf += 1; return Reflect.getPrototypeOf(target) },
    ownKeys(target) { traps.ownKeys += 1; return Reflect.ownKeys(target) },
    getOwnPropertyDescriptor(target, property) { traps.getOwnPropertyDescriptor += 1; return Reflect.getOwnPropertyDescriptor(target, property) },
  })
  assert.throws(() => parseCardWorkspaceResponse('read', proxy, 'card-1', 'TEST'), /could not be verified/)
  assert.deepEqual(traps, { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 })
})

test('wire limits reject oversized and deeply nested payloads', () => {
  assert.throws(
    () => parseCardWorkspaceResponse('read', wire({ ...validCard(), internal: 'x'.repeat(MAX_CARD_WORKSPACE_JSON_BYTES) }), 'card-1', 'TEST'),
    /could not be verified/,
  )
  let internal = 'leaf'
  for (let index = 0; index < MAX_CARD_WORKSPACE_JSON_DEPTH; index += 1) internal = { nested: internal }
  assert.throws(
    () => parseCardWorkspaceResponse('read', wire({ ...validCard(), internal }), 'card-1', 'TEST'),
    /could not be verified/,
  )
})
