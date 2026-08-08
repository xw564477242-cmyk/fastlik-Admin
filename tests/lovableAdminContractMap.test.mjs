import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LOVABLE_ADMIN_CONTRACTS,
  requestLovableAdminReadEndpoint,
  resolveLovableAdminReadEndpoints,
} from '../src/lovableAdminContractMap.ts'

const context = Object.freeze({
  tenantId: 'tenant-a',
  environment: 'SANDBOX',
  cardId: 'card-1',
  userId: 'user-1',
})

test('mapping covers every exported Lovable Admin surface exactly once', () => {
  assert.equal(LOVABLE_ADMIN_CONTRACTS.length, 10)
  assert.equal(new Set(LOVABLE_ADMIN_CONTRACTS.map(({ surface }) => surface)).size, 10)
})

test('mapping is read-only, relative, and restricted to SANDBOX and TEST', () => {
  for (const contract of LOVABLE_ADMIN_CONTRACTS) {
    assert.deepEqual(contract.environments, ['SANDBOX', 'TEST'])
    assert.equal(contract.environments.includes('UAT'), false)
    assert.equal(contract.environments.includes('PRODUCTION'), false)
    for (const endpoint of resolveLovableAdminReadEndpoints(contract.surface, context)) {
      assert.equal(endpoint.method, 'GET')
      assert.equal(endpoint.path.startsWith('/api/admin/'), true)
      assert.equal(/^https?:/i.test(endpoint.path), false)
    }
  }
})

test('resolver rejects UAT and PRODUCTION before resolving an endpoint', () => {
  assert.throws(
    () => resolveLovableAdminReadEndpoints('/admin/tenants', { ...context, environment: 'UAT' }),
    /only in SANDBOX or TEST/,
  )
  assert.throws(
    () => resolveLovableAdminReadEndpoints('/admin/tenants', { ...context, environment: 'PRODUCTION' }),
    /only in SANDBOX or TEST/,
  )
})

test('tenant identifiers cannot escape encoded path boundaries and card IDs fail closed', () => {
  const endpoints = resolveLovableAdminReadEndpoints('/admin/card-center', {
    ...context,
    tenantId: 'tenant/../../other?environment=PRODUCTION',
    cardId: 'card-1',
  })
  assert.equal(endpoints.length, 5)
  for (const endpoint of endpoints) {
    assert.match(endpoint.path, /^\/api\/admin\/tenants\/tenant%2F\.\.%2F\.\.%2Fother%3Fenvironment%3DPRODUCTION\/cards\/card-1\//)
    assert.equal(endpoint.path.includes('environment=PRODUCTION'), false)
  }
  assert.throws(
    () => resolveLovableAdminReadEndpoints('/admin/card-center', { ...context, cardId: 'card/1?operation=unfreeze' }),
    /requires a valid identifier/,
  )
})

test('real Admin request uses the mapped GET endpoint without Mock fallback or credential persistence', async () => {
  const [endpoint] = resolveLovableAdminReadEndpoints('/admin/tenants', context)
  let observed
  const requester = async (path, init) => {
    observed = { path, init }
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  assert.deepEqual(
    await requestLovableAdminReadEndpoint({ endpoint, adminBearer: 'sandbox-admin-token' }, requester),
    { items: [] },
  )
  assert.equal(observed.path, '/api/admin/tenants')
  assert.equal(observed.init.method, 'GET')
  assert.equal(observed.init.credentials, 'omit')
  assert.equal(observed.init.cache, 'no-store')
  assert.equal(observed.init.redirect, 'error')
  assert.equal(observed.init.headers.Authorization, 'Bearer sandbox-admin-token')
})

test('real Admin request fails closed for an invalid token or unmapped endpoint', async () => {
  const [endpoint] = resolveLovableAdminReadEndpoints('/admin/tenants', context)
  await assert.rejects(
    requestLovableAdminReadEndpoint({ endpoint, adminBearer: 'bad\nvalue' }),
    /valid administrator bearer/,
  )
  await assert.rejects(
    requestLovableAdminReadEndpoint({
      endpoint: { operationId: 'unsafe', method: 'GET', path: '/v1/cards/products' },
      adminBearer: 'sandbox-admin-token',
    }),
    /mapped read-only Admin endpoints/,
  )
})

test('identifier-dependent surfaces fail closed when context is incomplete', () => {
  assert.throws(
    () => resolveLovableAdminReadEndpoints('/admin/tenants/$tenantId', { ...context, tenantId: '' }),
    /valid tenant identifier/,
  )
  assert.throws(
    () => resolveLovableAdminReadEndpoints('/admin/card-center', { ...context, cardId: undefined }),
    /requires a valid identifier/,
  )
  assert.throws(
    () => resolveLovableAdminReadEndpoints('/admin/end-users', { ...context, userId: undefined }),
    /requires a valid identifier/,
  )
})

test('missing Backend contracts remain fail-closed with no fabricated endpoint', () => {
  for (const surface of ['/admin/products/$productId', '/admin/chain-config', '/admin/hot-wallets']) {
    const contract = LOVABLE_ADMIN_CONTRACTS.find((candidate) => candidate.surface === surface)
    assert.equal(contract?.status, 'BLOCKED_MISSING_CONTRACT')
    assert.deepEqual(resolveLovableAdminReadEndpoints(surface, context), [])
  }
})
