import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'
import {
  cardWorkspaceBaseScope,
  cardWorkspaceRequestScope,
  parseCardWorkspaceResponse,
} from '../src/cardWorkspaceContract.ts'
import {
  acceptsMountedResponse,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  syncRequestScope,
} from '../src/requestGeneration.ts'

const identity = Object.freeze({
  actorId: 'admin-1',
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
  tenantId: 'tenant-1',
  environment: 'TEST',
  mode: 'card',
  cardId: 'card-1',
})

const baseScope = (patch = {}) => {
  const value = { ...identity, ...patch }
  return cardWorkspaceBaseScope(
    value.actorId,
    value.sessionExpiresAt,
    value.tenantId,
    value.environment,
    value.mode,
  )
}

const requestScope = (action, patch = {}) => {
  const value = { ...identity, ...patch }
  return cardWorkspaceRequestScope(
    value.actorId,
    value.sessionExpiresAt,
    value.tenantId,
    value.environment,
    value.mode,
    value.cardId,
    action,
  )
}

const mountedHarness = () => ({
  mounted: true,
  gate: createRequestGate(baseScope()),
  writes: { success: 0, error: 0, finally: 0 },
})

const start = (harness, action, patch = {}) => {
  const scope = requestScope(action, patch)
  const ticket = beginRequest(harness.gate, scope)
  const current = () => acceptsMountedResponse(harness.mounted, harness.gate, ticket, scope)
  const settle = (kind) => {
    if (current()) harness.writes[kind] += 1
  }
  return { current, scope, settle }
}

test('Card detail and balance use only the Admin Bearer route family', () => {
  const productionApi = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  const cardApi = productionApi.slice(productionApi.indexOf('card:('), productionApi.indexOf('cardTimeline:'))

  assert.equal(adminRoutes.card('tenant-a', 'card-a'), '/admin/tenants/tenant-a/cards/card-a')
  assert.equal(adminRoutes.cardBalance('tenant-a', 'card-a'), '/admin/tenants/tenant-a/cards/card-a/balance')
  assert.match(cardApi, /adminRoutes\.card\(tenantId,cardId\)/)
  assert.match(cardApi, /adminRoutes\.cardBalance\(tenantId,cardId\)/)
  assert.equal(cardApi.includes('/v1/cards'), false)
  assert.equal(cardApi.includes("credentials:'include'"), false)
  assert.match(productionApi, /credentials:'omit'/)
  assert.match(productionApi, /Authorization:`Bearer \$\{token\}`/)
})

test('Admin has no limits client until a real Admin limits contract exists', () => {
  const productionApi = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  const adminApp = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const workspace = adminApp.slice(adminApp.indexOf('function CardWorkspace('), adminApp.indexOf('function OperationsWorkspace('))

  assert.equal(Object.hasOwn(adminRoutes, 'cardLimits'), false)
  assert.equal(/\bcardLimits\s*:/.test(productionApi), false)
  assert.equal(/run\(['"]limits['"]\)/.test(workspace), false)
  assert.equal(workspace.includes('/v1/cards'), false)
})

test('late detail and balance completions are zero-write after every identity or selection boundary change', () => {
  const invalidations = [
    (harness) => syncRequestScope(harness.gate, baseScope({ actorId: 'admin-2' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ sessionExpiresAt: '2099-02-01T00:00:00.000Z' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ tenantId: 'tenant-2' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ environment: 'SANDBOX' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ mode: 'history' })),
    (harness) => { start(harness, 'read', { cardId: 'card-2' }) },
    (harness) => { start(harness, 'balance') },
    (harness) => { invalidateRequests(harness.gate) },
    (harness) => { harness.mounted = false; invalidateRequests(harness.gate) },
  ]

  for (const action of ['read', 'balance']) {
    for (const invalidate of invalidations) {
      const harness = mountedHarness()
      const pending = start(harness, action)
      invalidate(harness)
      assert.equal(pending.current(), false)
      pending.settle('success')
      pending.settle('error')
      pending.settle('finally')
      assert.deepEqual(harness.writes, { success: 0, error: 0, finally: 0 })
    }
  }
})

test('selected Card identity and malformed balance DTOs fail closed before display', () => {
  const valid = {
    cardId: 'card-1',
    availableBalanceMinor: '1000',
    currentBalanceMinor: '1200',
    pendingAmountMinor: '200',
    currency: 'USD',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }

  assert.throws(
    () => parseCardWorkspaceResponse('balance', JSON.stringify({ ...valid, cardId: 'card-2' }), 'card-1'),
    /does not match the requested Card ID/,
  )
  for (const malformed of [
    { ...valid, availableBalanceMinor: null },
    { ...valid, currentBalanceMinor: 1200 },
    { ...valid, pendingAmountMinor: '2.00' },
    { ...valid, currency: 'usd' },
    { ...valid, updatedAt: '2026-08-01T00:00:00+08:00' },
    { ...valid, updatedAt: null },
  ]) {
    assert.throws(
      () => parseCardWorkspaceResponse('balance', JSON.stringify(malformed), 'card-1'),
      /could not be verified/,
    )
  }
})
