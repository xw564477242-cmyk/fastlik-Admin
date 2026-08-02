import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'
import {
  adminWalletOperationContractEvidence,
  parseAdminWalletOperationPage,
  WalletOperationListContractError,
  walletOperationListScope,
  walletOperationSessionReadAllowed,
} from '../src/walletOperationListContract.ts'

const query = Object.freeze({ status: 'COMPLETED', type: 'DEPOSIT', assetCode: 'USDT', limit: 25, offset: 0 })
const expected = Object.freeze({ tenantId: 'tenant-1', environment: 'TEST', query })
const operation = (patch = {}) => ({
  id: 'op-2',
  tenantId: 'tenant-1',
  environment: 'TEST',
  type: 'DEPOSIT',
  status: 'COMPLETED',
  idempotencyKey: 'e2f4e622-27ab-49c6-a701-352fed5ab7e8',
  assetCode: 'USDT',
  amount: '125.5',
  sourceAccountId: null,
  destinationAccountId: 'account-2',
  externalReference: null,
  journalIds: ['journal-2'],
  failureReason: null,
  createdAt: '2026-08-01T00:02:00.000Z',
  completedAt: '2026-08-01T00:02:01.000Z',
  updatedAt: '2026-08-01T00:02:01.000Z',
  ...patch,
})
const page = (items = [operation()], pagination = {}) => JSON.stringify({
  items,
  pagination: { total: items.length, limit: 25, offset: 0, hasMore: false, ...pagination },
})

test('builds the Backend dev route with exact SANDBOX/TEST filters and pagination', () => {
  assert.equal(
    adminRoutes.walletOperations('tenant/one', 'TEST', query),
    '/admin/tenants/tenant%2Fone/wallet/operations?environment=TEST&status=COMPLETED&type=DEPOSIT&assetCode=USDT&limit=25&offset=0',
  )
  assert.throws(() => adminRoutes.walletOperations('tenant-1', 'PRODUCTION', query), /environment is invalid/)
  assert.throws(() => adminRoutes.walletOperations('tenant-1', 'TEST', { ...query, assetCode: 'usd!' }), /asset code is invalid/)
})

test('accepts an exact, ordered, scope-bound Wallet operation page and exposes only safe fields', () => {
  const first = operation()
  const second = operation({
    id: 'op-1',
    idempotencyKey: 'hidden-idempotency',
    externalReference: 'hidden-provider-reference',
    failureReason: 'hidden-internal-reason',
    journalIds: ['hidden-journal'],
    createdAt: '2026-08-01T00:01:00.000Z',
    completedAt: '2026-08-01T00:01:01.000Z',
    updatedAt: '2026-08-01T00:01:01.000Z',
  })
  const parsed = parseAdminWalletOperationPage(page([first, second]), expected)
  assert.equal(parsed.operations.length, 2)
  assert.deepEqual(Object.keys(parsed.operations[0]), [
    'id', 'type', 'status', 'assetCode', 'amount', 'sourceAccountId', 'destinationAccountId', 'createdAt', 'completedAt', 'updatedAt',
  ])
  assert.equal(JSON.stringify(parsed).includes('hidden-provider-reference'), false)
  assert.equal(Object.isFrozen(parsed), true)
  assert.equal(Object.isFrozen(parsed.operations), true)
})

test('the same exact response contract is accepted in SANDBOX without weakening scope checks', () => {
  const sandboxOperation = operation({ environment: 'SANDBOX' })
  const parsed = parseAdminWalletOperationPage(page([sandboxOperation]), {
    tenantId: 'tenant-1', environment: 'SANDBOX', query,
  })
  assert.equal(parsed.operations[0].id, 'op-2')
  assert.throws(() => parseAdminWalletOperationPage(page([operation()]), {
    tenantId: 'tenant-1', environment: 'SANDBOX', query,
  }), WalletOperationListContractError)
})

test('rejects cross-tenant/environment/filter data, extra fields and invalid pagination', () => {
  const cases = [
    page([operation({ tenantId: 'tenant-2' })]),
    page([operation({ environment: 'SANDBOX' })]),
    page([operation({ status: 'FAILED' })]),
    page([{ ...operation(), secret: 'must-not-cross' }]),
    page([operation()], { limit: 100 }),
    page([operation()], { hasMore: true }),
  ]
  cases.forEach((wire) => assert.throws(
    () => parseAdminWalletOperationPage(wire, expected),
    WalletOperationListContractError,
  ))
})

test('rejects duplicates, non-monotonic ordering, unsafe amounts and oversized/deep payloads', () => {
  assert.throws(() => parseAdminWalletOperationPage(page([operation(), operation()]), expected), /duplicate/i)
  assert.throws(() => parseAdminWalletOperationPage(page([
    operation({ id: 'op-1', createdAt: '2026-08-01T00:01:00.000Z', completedAt: null, updatedAt: '2026-08-01T00:01:00.000Z' }),
    operation({ id: 'op-2' }),
  ]), expected), /expected order/i)
  assert.throws(() => parseAdminWalletOperationPage(page([operation({ amount: '-1' })]), expected), /could not be verified/i)
  assert.throws(() => parseAdminWalletOperationPage(page([operation({ amount: '1234567890123456789.00' })]), expected), /could not be verified/i)
  assert.throws(() => parseAdminWalletOperationPage('['.repeat(17) + ']'.repeat(17), expected), /could not be verified/i)
  assert.throws(() => parseAdminWalletOperationPage(' '.repeat(262_145), expected), /could not be verified/i)
})

test('scope and session predicates bind actor, expiry, tenant, environment and filters', () => {
  const session = {
    accessToken: 'token', tokenType: 'Bearer', expiresInSeconds: 3600, expiresAt: '2026-08-01T01:00:00.000Z',
    user: { id: 'admin-1', email: 'admin@example.test', tenantId: 'tenant-1', environment: 'TEST', roles: ['ADMIN'], permissions: ['wallet:read'] },
  }
  assert.equal(walletOperationSessionReadAllowed(session, 'tenant-1', 'TEST', Date.parse('2026-08-01T00:00:00.000Z')), true)
  assert.equal(walletOperationSessionReadAllowed(session, 'tenant-2', 'TEST', Date.parse('2026-08-01T00:00:00.000Z')), true)
  assert.equal(walletOperationSessionReadAllowed(session, 'tenant-1', 'PRODUCTION', Date.parse('2026-08-01T00:00:00.000Z')), false)
  assert.equal(walletOperationSessionReadAllowed(session, 'tenant-1', 'TEST', Date.parse(session.expiresAt)), false)
  assert.notEqual(
    walletOperationListScope('admin-1', session.expiresAt, 'tenant-1', 'TEST', query),
    walletOperationListScope('admin-1', session.expiresAt, 'tenant-1', 'TEST', { ...query, status: 'FAILED' }),
  )
  assert.deepEqual(adminWalletOperationContractEvidence('a'.repeat(40)).runtimeEnvironments, ['SANDBOX', 'TEST'])
})
