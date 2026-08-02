import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES,
  adminWalletTransactionFailureDecision,
  adminWalletTransactionPath,
  adminWalletTransactionScope,
  loadAdminWalletTransactions,
  normalizeAdminWalletTransactionQuery,
  parseAdminWalletTransactionPage,
  readAdminWalletTransactions,
} from '../src/adminWalletTransactionContract.ts'

const NOW = Date.parse('2026-08-02T12:00:00.000Z')
const session = (overrides = {}, userOverrides = {}) => ({
  accessToken: 'admin-wallet-transaction-token',
  tokenType: 'Bearer',
  expiresInSeconds: 3600,
  expiresAt: '2026-08-02T13:00:00.000Z',
  user: {
    id: 'admin-transaction-01',
    email: 'admin@example.test',
    tenantId: 'tenant-alpha',
    environment: 'TEST',
    roles: ['WALLET_VIEWER'],
    permissions: ['admin:read'],
    ...userOverrides,
  },
  ...overrides,
})
const query = (overrides = {}) => ({
  type: 'WITHDRAWAL',
  status: 'COMPLETED',
  assetCode: 'USD',
  limit: 2,
  offset: 0,
  ...overrides,
})
const transaction = (id = 'transaction-b', createdAt = '2026-08-02T10:00:00.000Z', overrides = {}) => ({
  id,
  tenantId: 'tenant-alpha',
  environment: 'TEST',
  walletAccountId: id.endsWith('b') ? 'wallet-alpha' : 'wallet-bravo',
  type: 'WITHDRAWAL',
  status: 'COMPLETED',
  assetCode: 'USD',
  amount: '25.5',
  referenceType: 'WalletOperation',
  referenceId: `operation-${id}`,
  idempotencyKey: `wallet-transaction-${id}`,
  journalIds: [`journal-${id}`],
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})
const wire = (overrides = {}) => JSON.stringify({
  items: [
    transaction('transaction-b', '2026-08-02T10:00:00.000Z'),
    transaction('transaction-a', '2026-08-02T09:00:00.000Z'),
  ],
  pagination: { total: 3, limit: 2, offset: 0, hasMore: true },
  ...overrides,
})

test('builds the exact session-environment, filter and offset-bound GET path', () => {
  assert.equal(
    adminWalletTransactionPath(session(), 'tenant-alpha', query(), NOW),
    '/admin/tenants/tenant-alpha/wallet/transactions?environment=TEST&type=WITHDRAWAL&status=COMPLETED&assetCode=USD&limit=2&offset=0',
  )
  for (const invalid of [
    { ...query(), customerId: 'attacker' },
    { ...query(), walletAccountId: 'wallet-attacker' },
    { ...query(), assetCode: 'usd' },
    { ...query(), type: 'PROVIDER_LOAD' },
    { ...query(), status: 'UNKNOWN' },
    { ...query(), limit: 101 },
    { ...query(), offset: -1 },
  ]) assert.throws(() => normalizeAdminWalletTransactionQuery(invalid), /Invalid/)
})

test('reconstructs and freezes exactly the Backend 14-field public transaction contract', () => {
  const page = parseAdminWalletTransactionPage(wire(), { tenantId: 'tenant-alpha', environment: 'TEST', query: query() })
  assert.deepEqual(Object.keys(page.items[0]), [
    'id', 'tenantId', 'environment', 'walletAccountId', 'type', 'status', 'assetCode',
    'amount', 'referenceType', 'referenceId', 'idempotencyKey', 'journalIds',
    'createdAt', 'updatedAt',
  ])
  assert.equal(Object.isFrozen(page), true)
  assert.equal(Object.isFrozen(page.items), true)
  assert.equal(Object.isFrozen(page.items[0]), true)
  assert.equal(Object.isFrozen(page.items[0].journalIds), true)
})

test('rejects unknown, missing, oversized, deep and duplicate-key responses', () => {
  assert.throws(() => parseAdminWalletTransactionPage(wire({ providerPayload: {} }), { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }), /page/)
  const unknownItem = transaction('transaction-b', '2026-08-02T10:00:00.000Z', { customerId: 'customer-private' })
  assert.throws(() => parseAdminWalletTransactionPage(wire({ items: [unknownItem] }), { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }), /record/)
  assert.throws(() => parseAdminWalletTransactionPage(`{"padding":"${'x'.repeat(MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES)}"}`, { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }), /consumer limit/)
  const deep = `${'['.repeat(18)}0${']'.repeat(18)}`
  assert.throws(() => parseAdminWalletTransactionPage(`{"extra":${deep},${wire().slice(1)}`, { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }), /Invalid/)
  assert.throws(
    () => parseAdminWalletTransactionPage(wire().replace('"id":"transaction-b"', '"id":"transaction-b","\\u0069d":"transaction-c"'), { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }),
    /Duplicate/,
  )
})

test('binds tenant, environment, filters, exact offset page and descending order', () => {
  for (const bad of [
    { items: [transaction('transaction-b', '2026-08-02T10:00:00.000Z', { tenantId: 'tenant-other' })] },
    { items: [transaction('transaction-b', '2026-08-02T10:00:00.000Z', { environment: 'SANDBOX' })] },
    { items: [transaction('transaction-b', '2026-08-02T10:00:00.000Z', { assetCode: 'EUR' })] },
    { items: [transaction('transaction-a', '2026-08-02T09:00:00.000Z'), transaction('transaction-b', '2026-08-02T10:00:00.000Z')] },
    { items: [transaction(), transaction()] },
    { pagination: { total: 3, limit: 2, offset: 1, hasMore: false } },
    { pagination: { total: 3, limit: 2, offset: 0, hasMore: false } },
  ]) assert.throws(() => parseAdminWalletTransactionPage(wire(bad), { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }))
})

test('emits one exact GET and revalidates the complete session scope after transport', async () => {
  const active = session()
  const scope = adminWalletTransactionScope(active, 'tenant-alpha', query(), NOW)
  const calls = []
  const snapshot = await readAdminWalletTransactions(async (request) => {
    calls.push(request)
    return wire()
  }, active, 'tenant-alpha', query(), scope, undefined, () => NOW)
  assert.equal(snapshot.scope, scope)
  assert.equal(snapshot.page.items.length, 2)
  assert.deepEqual(calls, [{
    path: '/admin/tenants/tenant-alpha/wallet/transactions?environment=TEST&type=WITHDRAWAL&status=COMPLETED&assetCode=USD&limit=2&offset=0',
    method: 'GET',
    token: 'admin-wallet-transaction-token',
    signal: undefined,
  }])
})

test('fails before transport on actor, tenant, environment, expiry or pagination scope mismatch', async () => {
  const active = session()
  const scope = adminWalletTransactionScope(active, 'tenant-alpha', query(), NOW)
  const candidates = [
    [session({}, { id: 'admin-other' }), 'tenant-alpha', query()],
    [session({}, { tenantId: 'tenant-other' }), 'tenant-other', query()],
    [session({}, { environment: 'SANDBOX' }), 'tenant-alpha', query()],
    [session({ expiresAt: '2026-08-02T12:00:00.000Z' }), 'tenant-alpha', query()],
    [active, 'tenant-alpha', query({ offset: 2 })],
  ]
  for (const [candidate, tenantId, candidateQuery] of candidates) {
    let called = false
    await assert.rejects(readAdminWalletTransactions(async () => { called = true; return wire() }, candidate, tenantId, candidateQuery, scope, undefined, () => NOW), /scope/)
    assert.equal(called, false)
  }
})

test('rejects natural expiry and abort after transport with zero returned snapshot', async () => {
  const active = session()
  const scope = adminWalletTransactionScope(active, 'tenant-alpha', query(), NOW)
  let clock = NOW
  await assert.rejects(readAdminWalletTransactions(async () => {
    clock = Date.parse(active.expiresAt)
    return wire()
  }, active, 'tenant-alpha', query(), scope, undefined, () => clock), /session|scope/)

  const controller = new AbortController()
  let release
  const pending = readAdminWalletTransactions(() => new Promise((resolve) => { release = resolve }), active, 'tenant-alpha', query(), scope, controller.signal, () => NOW)
  await Promise.resolve()
  controller.abort()
  release(wire())
  await assert.rejects(pending, (error) => error instanceof DOMException && error.name === 'AbortError')
})

test('retains only same-scope verified data for 408/5xx and exits only on 401', async () => {
  const active = session()
  const scope = adminWalletTransactionScope(active, 'tenant-alpha', query(), NOW)
  const previous = Object.freeze({ scope, page: parseAdminWalletTransactionPage(wire(), { tenantId: 'tenant-alpha', environment: 'TEST', query: query() }) })
  for (const status of [408, 500, 503, 599]) {
    const result = await loadAdminWalletTransactions(async () => { throw Object.freeze({ status }) }, active, 'tenant-alpha', query(), previous, undefined, () => NOW)
    assert.equal(result.snapshot, previous)
    assert.equal(result.exitSession, false)
  }
  const unauthorized = await loadAdminWalletTransactions(async () => { throw Object.freeze({ status: 401 }) }, active, 'tenant-alpha', query(), previous, undefined, () => NOW)
  assert.equal(unauthorized.snapshot, null)
  assert.equal(unauthorized.exitSession, true)
  const forbidden = await loadAdminWalletTransactions(async () => { throw Object.freeze({ status: 403 }) }, active, 'tenant-alpha', query(), previous, undefined, () => NOW)
  assert.equal(forbidden.snapshot, null)
  assert.equal(forbidden.exitSession, false)
  const otherScope = await loadAdminWalletTransactions(async () => { throw Object.freeze({ status: 500 }) }, active, 'tenant-alpha', query({ offset: 2 }), previous, undefined, () => NOW)
  assert.equal(otherScope.snapshot, null)
})

test('never executes hostile status or query accessors', () => {
  let statusRead = false
  const hostileError = Object.defineProperty({}, 'status', { get() { statusRead = true; return 401 } })
  assert.equal(adminWalletTransactionFailureDecision(hostileError), 'DROP')
  assert.equal(statusRead, false)
  let queryRead = false
  const hostileQuery = Object.defineProperty({ status: 'COMPLETED', assetCode: 'USD', limit: 2, offset: 0 }, 'type', { enumerable: true, get() { queryRead = true; return 'WITHDRAWAL' } })
  assert.throws(() => normalizeAdminWalletTransactionQuery(hostileQuery), /Invalid/)
  assert.equal(queryRead, false)
})

test('production workspace binds mounted writes, cancellation, token and 401 exit to the tested contract', () => {
  const source = readFileSync(new URL('../src/WalletTransactionsWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(source, /useScopedRequestLifecycle\(baseScope\)/)
  assert.match(source, /currentScope\.current === baseScope/)
  assert.match(source, /currentToken\.current === session\.accessToken/)
  assert.match(source, /acceptsMountedResponse\(lifecycle\.mounted\.current/)
  assert.match(source, /loadAdminWalletTransactions\(client, session, tenantId, requestedQuery, previous, controller\.signal, now\)/)
  assert.match(source, /if \(result\.exitSession\)/)
  assert.match(source, /onUnauthorized\(\)/)
  assert.match(source, /scope: baseScope, busy: true, snapshot: previous/)
  assert.equal(source.includes("method: 'POST'"), false)
})
