import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MAX_ADMIN_KYC_JSON_BYTES,
  adminKycBaseScope,
  adminKycLookupScope,
  adminKycPath,
  adminKycSessionReadAllowed,
  parseAdminKycResponse,
} from '../src/adminKycContract.ts'

const now = Date.parse('2026-08-02T00:00:00.000Z')
const session = (patch = {}) => ({
  accessToken: 'admin-session-api-key-never-rendered',
  expiresAt: '2026-08-02T01:00:00.000Z',
  user: {
    id: 'admin-1',
    tenantId: 'home-tenant',
    environment: 'TEST',
    roles: ['ADMIN'],
    permissions: ['kyc:read'],
    ...patch,
  },
})

test('builds only the exact SANDBOX/TEST KYC GET path under the existing /api base', () => {
  assert.equal(
    adminKycPath('tenant-1', 'user-1', 'TEST'),
    '/admin/tenants/tenant-1/users/user-1/kyc?environment=TEST',
  )
  assert.equal(
    `/api${adminKycPath('tenant-2', 'user-2', 'SANDBOX')}`,
    '/api/admin/tenants/tenant-2/users/user-2/kyc?environment=SANDBOX',
  )
  assert.throws(() => adminKycPath('tenant-1', 'user-1', 'PRODUCTION'), /SANDBOX or TEST/)
  assert.throws(() => adminKycPath('tenant/escape', 'user-1', 'TEST'), /tenant/)
  assert.throws(() => adminKycPath('tenant-1', 'user?environment=PRODUCTION', 'TEST'), /user lookup/)
  for (const tenantId of ['t', 'tenant:one']) assert.throws(() => adminKycPath(tenantId, 'user-1', 'TEST'), /tenant/)
  for (const userId of ['u', 'user:one']) assert.throws(() => adminKycPath('tenant-1', userId, 'TEST'), /user lookup/)
})

test('returns exactly userId, status and nullable reviewedAt', () => {
  for (const status of ['PENDING', 'APPROVED', 'REJECTED']) {
    assert.deepEqual(
      parseAdminKycResponse(JSON.stringify({ userId: 'user-1', status, reviewedAt: null }), 'user-1'),
      { userId: 'user-1', status, reviewedAt: null },
    )
  }
  assert.equal(
    parseAdminKycResponse(JSON.stringify({ userId: 'user-1', status: 'APPROVED', reviewedAt: '2026-08-01T11:22:33.123Z' }), 'user-1').reviewedAt,
    '2026-08-01T11:22:33.123Z',
  )
})

test('rejects cross-user, internal, identity, Provider and Wallet fields', () => {
  const exact = { userId: 'user-1', status: 'PENDING', reviewedAt: null }
  assert.throws(() => parseAdminKycResponse(JSON.stringify({ ...exact, userId: 'user-2' }), 'user-1'), /requested user/)
  for (const field of ['email', 'name', 'providerRef', 'wallets', 'tenantId', 'environment', 'kycProvider']) {
    assert.throws(() => parseAdminKycResponse(JSON.stringify({ ...exact, [field]: 'private' }), 'user-1'), /exactly/)
  }
  for (const status of ['VERIFIED', 'FAILED', 'approved', '']) {
    assert.throws(() => parseAdminKycResponse(JSON.stringify({ ...exact, status }), 'user-1'), /status/)
  }
  for (const reviewedAt of ['later', '2026-02-30T00:00:00Z', 0, false]) {
    assert.throws(() => parseAdminKycResponse(JSON.stringify({ ...exact, reviewedAt }), 'user-1'), /reviewedAt/)
  }
})

test('rejects malformed, oversized, duplicate and escaped-equivalent response fields', () => {
  assert.throws(() => parseAdminKycResponse('{', 'user-1'), /could not be verified/)
  assert.throws(
    () => parseAdminKycResponse('{"userId":"user-1","status":"PENDING","status":"APPROVED","reviewedAt":null}', 'user-1'),
    /Duplicate/,
  )
  assert.throws(
    () => parseAdminKycResponse('{"userId":"user-1","status":"PENDING","sta\\u0074us":"APPROVED","reviewedAt":null}', 'user-1'),
    /Duplicate/,
  )
  assert.throws(
    () => parseAdminKycResponse(JSON.stringify({ userId: 'user-1', status: 'PENDING', reviewedAt: null, padding: 'x'.repeat(MAX_ADMIN_KYC_JSON_BYTES) }), 'user-1'),
    /could not be verified/,
  )
})

test('scope binds verified admin, home and selected tenants, environment, RBAC, tab and lookup without exposing the API key', () => {
  const identity = session()
  const base = adminKycBaseScope(identity, 'TEST', 'selected-tenant', 'user', now)
  assert.ok(base)
  for (const value of ['admin-1', 'home-tenant', 'selected-tenant', 'TEST', 'ADMIN', 'kyc:read', 'user']) assert.match(base, new RegExp(value))
  assert.equal(base.includes(identity.accessToken), false)
  const lookup = adminKycLookupScope(base, 'user-1')
  assert.match(lookup, /user-1/)
  assert.notEqual(adminKycLookupScope(base, 'user-2'), lookup)
})

test('production, local, UAT, unknown, mismatch, expiry, missing key and wrong tab fail before fetch', () => {
  const identity = session()
  assert.equal(adminKycSessionReadAllowed(identity, 'TEST', 'tenant-1', 'user', now), true)
  for (const runtime of ['PRODUCTION', 'LOCAL', 'UAT', undefined])
    assert.equal(adminKycSessionReadAllowed(identity, runtime, 'tenant-1', 'user', now), false)
  assert.equal(adminKycSessionReadAllowed(identity, 'SANDBOX', 'tenant-1', 'user', now), false)
  assert.equal(adminKycSessionReadAllowed(identity, 'TEST', 'tenant-1', 'trace', now), false)
  assert.equal(adminKycSessionReadAllowed(identity, 'TEST', 'tenant-1', 'user', Date.parse(identity.expiresAt)), false)
  assert.equal(adminKycSessionReadAllowed({ ...identity, accessToken: '' }, 'TEST', 'tenant-1', 'user', now), false)
  assert.equal(adminKycSessionReadAllowed(identity, 'TEST', 't', 'user', now), false)
  assert.equal(adminKycSessionReadAllowed(identity, 'TEST', 'tenant:one', 'user', now), false)
  assert.equal(adminKycLookupScope(adminKycBaseScope(identity, 'TEST', 'tenant-1', 'user', now), 'u'), null)
  assert.equal(adminKycLookupScope(adminKycBaseScope(identity, 'TEST', 'tenant-1', 'user', now), 'user:one'), null)
})

test('productionApi exposes only the bounded exact Admin KYC reader and removes the broad user reader', () => {
  const source = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  assert.match(source, /adminKyc:async/)
  assert.match(source, /adminKycPath\(tenantId,userId,environment\)/)
  assert.match(source, /parseAdminKycResponse/)
  assert.match(source, /format:'bounded-text',maxBytes:MAX_ADMIN_KYC_JSON_BYTES/)
  assert.equal(/\n user:/.test(source), false)
})
