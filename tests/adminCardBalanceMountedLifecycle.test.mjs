import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'
import {
  adminCardSnapshotFailurePolicy,
  cardWorkspaceBaseScope,
  cardWorkspaceRequestScope,
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
  sessionMarker: 'session-marker-1',
})

const baseScope = (patch = {}) => {
  const value = { ...identity, ...patch }
  return `${cardWorkspaceBaseScope(value.actorId, value.sessionExpiresAt, value.tenantId, value.environment, value.mode)}\u0000${value.sessionMarker}`
}

const requestScope = (action, patch = {}) => {
  const value = { ...identity, ...patch }
  return `${cardWorkspaceRequestScope(
    value.actorId,
    value.sessionExpiresAt,
    value.tenantId,
    value.environment,
    value.mode,
    value.cardId,
    action,
  )}\u0000${value.sessionMarker}`
}

const mountedHarness = () => ({
  mounted: true,
  gate: createRequestGate(baseScope()),
  snapshot: Object.freeze({ kind: 'CARD', id: 'verified-card' }),
  writes: { success: 0, error: 0, finally: 0, invalidation: 0 },
})

const start = (harness, action, patch = {}) => {
  const scope = requestScope(action, patch)
  const ticket = beginRequest(harness.gate, scope)
  const current = () => acceptsMountedResponse(harness.mounted, harness.gate, ticket, scope)
  const settle = (kind) => { if (current()) harness.writes[kind] += 1 }
  return { current, scope, settle }
}

test('detail, balance and limits use only the persisted Admin Bearer snapshot routes', () => {
  const productionApi = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  const cardApi = productionApi.slice(productionApi.indexOf('cardSnapshot:('), productionApi.indexOf('cardTimeline:'))
  assert.equal(adminRoutes.cardSnapshot('tenant-a', 'card-a'), '/admin/tenants/tenant-a/cards/card-a/snapshot')
  assert.equal(adminRoutes.cardBalanceSnapshot('tenant-a', 'card-a'), '/admin/tenants/tenant-a/cards/card-a/snapshot/balance')
  assert.equal(adminRoutes.cardLimitsSnapshot('tenant-a', 'card-a'), '/admin/tenants/tenant-a/cards/card-a/snapshot/limits')
  assert.match(cardApi, /adminRoutes\.cardSnapshot\(tenantId,cardId\)/)
  assert.match(cardApi, /adminRoutes\.cardBalanceSnapshot\(tenantId,cardId\)/)
  assert.match(cardApi, /adminRoutes\.cardLimitsSnapshot\(tenantId,cardId\)/)
  assert.equal(cardApi.includes("adminRoutes.card(tenantId,cardId),key,'GET'"), false)
  assert.equal(cardApi.includes("adminRoutes.cardBalance(tenantId,cardId)"), false)
  assert.equal(cardApi.includes('/v1/cards'), false)
  assert.equal(cardApi.includes("credentials:'include'"), false)
  assert.match(productionApi, /credentials:'omit'/)
  assert.match(productionApi, /Authorization:`Bearer \$\{token\}`/)
})

test('Card workspace exposes limits and retains verified snapshots while refreshing', () => {
  const adminApp = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const workspace = adminApp.slice(adminApp.indexOf('function CardWorkspace('), adminApp.indexOf('function OperationsWorkspace('))
  assert.match(workspace, /run\('limits'\)/)
  assert.match(workspace, /productionApi\.cardSnapshot/)
  assert.match(workspace, /productionApi\.cardBalanceSnapshot/)
  assert.match(workspace, /productionApi\.cardLimitsSnapshot/)
  assert.match(workspace, /if \(action !== 'history' && !snapshotAction\) setView\(null\)/)
  assert.match(workspace, /adminCardSnapshotFailurePolicy\(error\)/)
  assert.equal(workspace.includes('/v1/cards'), false)
})

test('late snapshot completions are zero-write after every identity or selection boundary change', () => {
  const invalidations = [
    (harness) => syncRequestScope(harness.gate, baseScope({ actorId: 'admin-2' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ sessionExpiresAt: '2099-02-01T00:00:00.000Z' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ tenantId: 'tenant-2' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ environment: 'SANDBOX' })),
    (harness) => syncRequestScope(harness.gate, baseScope({ sessionMarker: 'session-marker-2' })),
    (harness) => { start(harness, 'read', { cardId: 'card-2' }) },
    (harness) => { start(harness, 'balance') },
    (harness) => { start(harness, 'limits') },
    (harness) => { invalidateRequests(harness.gate) },
    (harness) => { harness.mounted = false; invalidateRequests(harness.gate) },
  ]
  for (const action of ['read', 'balance', 'limits']) {
    for (const invalidate of invalidations) {
      const harness = mountedHarness()
      const pending = start(harness, action)
      invalidate(harness)
      assert.equal(pending.current(), false)
      pending.settle('success')
      pending.settle('error')
      pending.settle('finally')
      assert.deepEqual(harness.writes, { success: 0, error: 0, finally: 0, invalidation: 0 })
    }
  }
})

test('current transient failure retains the exact verified object while current 401 owns invalidation', () => {
  for (const status of [0, 408, 500, 503]) {
    const harness = mountedHarness()
    const verified = harness.snapshot
    const pending = start(harness, 'read')
    const policy = adminCardSnapshotFailurePolicy({ status })
    if (pending.current() && !policy.retainSnapshot) harness.snapshot = null
    if (pending.current()) pending.settle('error')
    assert.equal(harness.snapshot, verified)
    assert.equal(harness.writes.invalidation, 0)
  }
  const harness = mountedHarness()
  const pending = start(harness, 'balance')
  const policy = adminCardSnapshotFailurePolicy({ status: 401 })
  if (pending.current() && !policy.retainSnapshot) harness.snapshot = null
  if (pending.current() && policy.invalidateSession) harness.writes.invalidation += 1
  assert.equal(harness.snapshot, null)
  assert.equal(harness.writes.invalidation, 1)
})

test('a stale 401 cannot clear the next snapshot or invalidate the next session', () => {
  const harness = mountedHarness()
  const pending = start(harness, 'limits')
  syncRequestScope(harness.gate, baseScope({ sessionMarker: 'session-marker-next' }))
  const next = Object.freeze({ kind: 'LIMITS', id: 'next-verified' })
  harness.snapshot = next
  const policy = adminCardSnapshotFailurePolicy({ status: 401 })
  if (pending.current() && !policy.retainSnapshot) harness.snapshot = null
  if (pending.current() && policy.invalidateSession) harness.writes.invalidation += 1
  pending.settle('error')
  pending.settle('finally')
  assert.equal(harness.snapshot, next)
  assert.equal(harness.writes.invalidation, 0)
})
