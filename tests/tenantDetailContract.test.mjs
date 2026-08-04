import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MAX_TENANT_DETAIL_JSON_BYTES, parseTenantDetailResponse } from '../src/tenantDetailContract.ts'

const tenant = (patch = {}) => ({
  id: 'tenant-a', legalName: 'Tenant A Ltd', brandName: 'Tenant A', slug: 'tenant-a',
  status: 'ACTIVE', environment: 'SANDBOX', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z', ...patch,
})

test('accepts only the exact public tenant detail in the requested environment', () => {
  assert.deepEqual(parseTenantDetailResponse(JSON.stringify(tenant()), 'tenant-a', 'SANDBOX'), tenant())
  assert.throws(() => parseTenantDetailResponse(JSON.stringify(tenant({ id: 'tenant-b' })), 'tenant-a', 'SANDBOX'), /requested tenant/)
  assert.throws(() => parseTenantDetailResponse(JSON.stringify(tenant({ environment: 'PRODUCTION' })), 'tenant-a', 'SANDBOX'), /environment boundary/)
})

test('rejects internal fields, malformed values and oversized payloads', () => {
  for (const field of ['users', 'apiClients', 'providerConfiguration', 'secrets']) {
    assert.throws(() => parseTenantDetailResponse(JSON.stringify({ ...tenant(), [field]: [] }), 'tenant-a', 'SANDBOX'), /exactly/)
  }
  assert.throws(() => parseTenantDetailResponse('{', 'tenant-a', 'SANDBOX'), /verified/)
  assert.throws(() => parseTenantDetailResponse(JSON.stringify(tenant({ status: 'UNKNOWN' })), 'tenant-a', 'SANDBOX'), /status/)
  assert.throws(() => parseTenantDetailResponse(JSON.stringify(tenant({ createdAt: '2026-08-01' })), 'tenant-a', 'SANDBOX'), /createdAt/)
  assert.throws(() => parseTenantDetailResponse(JSON.stringify({ ...tenant(), padding: 'x'.repeat(MAX_TENANT_DETAIL_JSON_BYTES) }), 'tenant-a', 'SANDBOX'), /consumer limit/)
})

test('Admin page exposes a clickable detail flow and bounded GET client', () => {
  const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  assert.match(app, /function TenantWorkspace/)
  assert.match(app, /查看详情/)
  assert.match(app, /productionApi\.tenant\(DEFAULT_API, session\.accessToken, tenantId, environment, request\.signal\)/)
  assert.match(app, /mountedScopeRef\.current === requestScope/)
  assert.match(api, /format:'bounded-text',maxBytes:MAX_TENANT_DETAIL_JSON_BYTES/)
  assert.match(api, /parseTenantDetailResponse/)
})
