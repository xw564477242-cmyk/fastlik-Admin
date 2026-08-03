import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_TREASURY_FUNDS_INSTRUCTION_JSON_BYTES,
  parseTreasuryFundsInstructionReceipt,
  treasuryFundsBaseScope,
  treasuryFundsFailurePolicy,
  treasuryFundsLookupScope,
  treasuryFundsSessionReadAllowed,
} from '../src/treasuryFundsInstructionContract.ts'
import { adminRoutes } from '../src/adminRoutes.ts'

const receipt = (patch = {}) => ({
  instructionId: 'instruction-20260803-0001',
  operationId: 'operation-0001',
  status: 'COMPLETED',
  direction: 'INFLOW',
  assetCode: 'USD',
  amountMinor: '12500',
  completedAt: '2026-08-03T01:02:03.456Z',
  journal: {
    id: 'journal-0001',
    status: 'POSTED',
    entries: [
      { accountRole: 'CLEARING', side: 'CREDIT', assetCode: 'USD', amountMinor: '12500' },
      { accountRole: 'TREASURY', side: 'DEBIT', assetCode: 'USD', amountMinor: '12500' },
    ],
  },
  treasury: { availableBalanceMinor: '999999999999999999', version: 1 },
  auditRecorded: true,
  ...patch,
})

const parse = (value = receipt(), operationId = 'operation-0001') =>
  parseTreasuryFundsInstructionReceipt(JSON.stringify(value), operationId)

const session = (patch = {}) => ({
  accessToken: 't'.repeat(32),
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'admin-1', tenantId: 'tenant-1', environment: 'TEST', roles: ['ADMIN'], permissions: ['admin:read'],
    ...patch,
  },
})

test('parses the exact immutable two-entry Backend receipt', () => {
  const value = parse()
  assert.deepEqual(value, receipt())
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.journal), true)
  assert.equal(Object.isFrozen(value.journal.entries), true)
  assert.equal(value.journal.entries.every(Object.isFrozen), true)
  assert.equal(Object.isFrozen(value.treasury), true)
})

test('accepts the exact OUTFLOW directional balance only', () => {
  const value = parse(receipt({
    direction: 'OUTFLOW',
    journal: {
      id: 'journal-0001', status: 'POSTED', entries: [
        { accountRole: 'CLEARING', side: 'DEBIT', assetCode: 'USD', amountMinor: '12500' },
        { accountRole: 'TREASURY', side: 'CREDIT', assetCode: 'USD', amountMinor: '12500' },
      ],
    },
  }))
  assert.equal(value.direction, 'OUTFLOW')
})

test('rejects undeclared, missing, duplicate, oversized and over-depth JSON', () => {
  assert.throws(() => parse({ ...receipt(), internalTenantId: 'tenant-1' }), /fields do not match/)
  const missing = receipt(); delete missing.auditRecorded
  assert.throws(() => parse(missing), /fields do not match/)
  const raw = JSON.stringify(receipt()).replace('"status":"POSTED"', '"status":"POSTED","status":"POSTED"')
  assert.throws(() => parseTreasuryFundsInstructionReceipt(raw, 'operation-0001'), /duplicate field/)
  assert.throws(
    () => parseTreasuryFundsInstructionReceipt(`${JSON.stringify(receipt()).slice(0, -1)},"padding":"${'x'.repeat(MAX_TREASURY_FUNDS_INSTRUCTION_JSON_BYTES)}"}`, 'operation-0001'),
    /bounded contract/,
  )
  assert.throws(
    () => parseTreasuryFundsInstructionReceipt(JSON.stringify({ a: { b: { c: { d: { e: true } } } } }), 'operation-0001'),
    /allowed depth/,
  )
})

test('rejects identifier, enum, timestamp, minor-unit and audit mismatches', () => {
  for (const value of [
    receipt({ operationId: 'operation-other' }),
    receipt({ instructionId: 'short' }),
    receipt({ status: 'PENDING' }),
    receipt({ direction: 'SIDEWAYS' }),
    receipt({ assetCode: 'usd' }),
    receipt({ amountMinor: '0' }),
    receipt({ amountMinor: '1.5' }),
    receipt({ amountMinor: '1000000000000000000' }),
    receipt({ completedAt: '2026-08-03T01:02:03Z' }),
    receipt({ auditRecorded: false }),
  ]) assert.throws(() => parse(value), /invalid|does not match|missing/)
})

test('rejects Journal shape, order, balance, asset and amount drift', () => {
  const base = receipt().journal
  for (const journal of [
    { ...base, internalId: 'secret' },
    { ...base, status: 'DRAFT' },
    { ...base, entries: base.entries.slice(0, 1) },
    { ...base, entries: [...base.entries].reverse() },
    { ...base, entries: base.entries.map((entry) => ({ ...entry, side: 'DEBIT' })) },
    { ...base, entries: [base.entries[0], { ...base.entries[1], assetCode: 'EUR' }] },
    { ...base, entries: [base.entries[0], { ...base.entries[1], amountMinor: '12501' }] },
    { ...base, entries: [base.entries[0], { ...base.entries[1], internalAccountId: 'account-1' }] },
  ]) assert.throws(() => parse(receipt({ journal })), /Journal|entry/)
})

test('rejects invalid Treasury position receipts', () => {
  for (const treasury of [
    { availableBalanceMinor: '-1', version: 1 },
    { availableBalanceMinor: '1.0', version: 1 },
    { availableBalanceMinor: '1', version: 0 },
    { availableBalanceMinor: '1', version: 1.5 },
    { availableBalanceMinor: '1', version: 2_147_483_648 },
    { availableBalanceMinor: '1', version: 1, internal: true },
  ]) assert.throws(() => parse(receipt({ treasury })), /Treasury position|availableBalanceMinor/)
})

test('session gate mirrors Backend admin and cross-tenant permission boundaries', () => {
  const now = Date.parse('2026-08-03T00:00:00.000Z')
  assert.equal(treasuryFundsSessionReadAllowed(session(), 'TEST', 'tenant-1', now), true)
  assert.equal(treasuryFundsSessionReadAllowed(session({ permissions: ['admin:*'] }), 'TEST', 'tenant-1', now), true)
  assert.equal(treasuryFundsSessionReadAllowed(session({ permissions: ['*'] }), 'TEST', 'tenant-2', now), true)
  assert.equal(treasuryFundsSessionReadAllowed(session({ permissions: ['admin:read', 'platform:tenants:write'] }), 'TEST', 'tenant-2', now), true)
  assert.equal(treasuryFundsSessionReadAllowed(session({ permissions: ['admin:read'] }), 'TEST', 'tenant-2', now), false)
  assert.equal(treasuryFundsSessionReadAllowed(session({ permissions: ['platform:tenants:write'] }), 'TEST', 'tenant-1', now), false)
  assert.equal(treasuryFundsSessionReadAllowed(session({ environment: 'PRODUCTION' }), 'PRODUCTION', 'tenant-1', now), false)
  assert.equal(treasuryFundsSessionReadAllowed(session(), 'SANDBOX', 'tenant-1', now), false)
  assert.equal(treasuryFundsSessionReadAllowed({ ...session(), accessToken: 'short' }, 'TEST', 'tenant-1', now), false)
  assert.equal(treasuryFundsSessionReadAllowed({ ...session(), expiresAt: '2026-08-03T00:00:00.000Z' }, 'TEST', 'tenant-1', now), false)
})

test('scope covers actor, home and selected tenant, environment, authorities and lookup', () => {
  const identity = session({ permissions: ['platform:tenants:write', 'admin:read'] })
  const base = treasuryFundsBaseScope(identity, 'TEST', 'tenant-2', Date.parse('2026-08-03T00:00:00.000Z'))
  assert.ok(base)
  for (const value of ['admin-1', 'tenant-1', 'tenant-2', 'TEST', 'admin:read', 'platform:tenants:write']) assert.match(base, new RegExp(value))
  assert.match(treasuryFundsLookupScope(base, 'operation-0001'), /operation-0001$/)
  assert.equal(treasuryFundsLookupScope(base, 'operation/id'), null)
})

test('401, 403 and 404 fail closed, with session invalidation only for 401', () => {
  for (const status of [401, 403, 404]) {
    assert.deepEqual(treasuryFundsFailurePolicy(Object.assign(new Error('private'), { status })), {
      status, clearSnapshot: true, invalidateSession: status === 401,
    })
  }
  assert.deepEqual(treasuryFundsFailurePolicy(new Error('network')), { status: null, clearSnapshot: false, invalidateSession: false })
})

test('route encodes tenant and operation while fixing environment to SANDBOX or TEST types', () => {
  assert.equal(
    adminRoutes.treasuryFundsInstruction('tenant/acme?environment=PRODUCTION', 'operation/1?other=true', 'TEST'),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/treasury/funds-instructions/operation%2F1%3Fother%3Dtrue?environment=TEST',
  )
})
