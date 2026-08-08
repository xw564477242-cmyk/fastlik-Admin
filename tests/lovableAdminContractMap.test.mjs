import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LOVABLE_ADMIN_CONTRACTS,
  requestLovableAdminReadEndpoint,
  requestLovableAdminWriteEndpoint,
  resolveLovableAdminReadEndpoints,
  resolveLovableAdminWriteEndpoint,
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

test('four Phase 1 writes map only to relative SANDBOX Admin endpoints', () => {
  assert.deepEqual(resolveLovableAdminWriteEndpoint('createTenant', context), { operationId: 'createTenant', method: 'POST', path: '/api/admin/tenants' })
  assert.deepEqual(resolveLovableAdminWriteEndpoint('createCardProductTemplate', context), { operationId: 'createCardProductTemplate', method: 'POST', path: '/api/admin/tenants/tenant-a/card-products' })
  assert.deepEqual(resolveLovableAdminWriteEndpoint('createCardApplication', context), { operationId: 'createCardApplication', method: 'POST', path: '/api/admin/tenants/tenant-a/card-applications' })
  assert.deepEqual(resolveLovableAdminWriteEndpoint('setCardFeeMode', context), { operationId: 'setCardFeeMode', method: 'PUT', path: '/api/admin/tenants/tenant-a/cards/card-1/fees' })
  assert.throws(() => resolveLovableAdminWriteEndpoint('createTenant', { ...context, environment: 'TEST' }), /restricted to SANDBOX/)
  assert.throws(() => resolveLovableAdminWriteEndpoint('createTenant', { ...context, environment: 'PRODUCTION' }), /only in SANDBOX or TEST/)
})

test('mapped write sends JSON with memory-only bearer and rejects unapproved routes', async () => {
  const endpoint = resolveLovableAdminWriteEndpoint('createCardApplication', context)
  let observed
  const requester = async (path, init) => {
    observed = { path, init }
    return new Response(JSON.stringify({ id: 'application-1' }), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  const body = { customerId: 'customer-1', productTemplateId: 'template-1', idempotencyKey: 'application:key:1' }
  assert.deepEqual(await requestLovableAdminWriteEndpoint({ endpoint, adminBearer: 'sandbox-admin-token', body }, requester), { id: 'application-1' })
  assert.equal(observed.path, '/api/admin/tenants/tenant-a/card-applications')
  assert.equal(observed.init.method, 'POST')
  assert.equal(observed.init.credentials, 'omit')
  assert.equal(observed.init.headers.Authorization, 'Bearer sandbox-admin-token')
  assert.deepEqual(JSON.parse(observed.init.body), body)
  await assert.rejects(requestLovableAdminWriteEndpoint({ endpoint: { operationId: 'unsafe', method: 'PUT', path: '/v1/cards' }, adminBearer: 'sandbox-admin-token', body: {} }), /not mapped/)
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
