import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  appendAdminCardTimelinePage,
  cardTimelineCollectionScope,
  cardTimelineRequestScope,
  cardTimelineSessionReadAllowed,
  cardTimelineSessionScope,
  cardTimelineShouldClearSnapshot,
  cardTimelineShouldInvalidateSession,
  createAdminCardTimelineFeed,
  parseAdminCardTimelinePage,
} from '../src/cardTimelineContract.ts'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  replaceRequestAbort,
  transitionRequestBaseScope,
} from '../src/requestGeneration.ts'

const identity = Object.freeze({
  actorId: 'admin-1',
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
  tenantId: 'tenant-1',
  sessionTenantId: 'tenant-1',
  environment: 'TEST',
  cardId: 'card-1',
  accessToken: 'token-current',
  tokenIdentityMarker: 'token-marker-current',
  roles: ['ADMIN'],
  permissions: ['admin:read'],
})
const current = (patch = {}) => ({ ...identity, ...patch })
const session = (value) => ({
  accessToken: value.accessToken,
  expiresAt: value.sessionExpiresAt,
  user: {
    id: value.actorId,
    tenantId: value.sessionTenantId,
    environment: value.environment,
    roles: value.roles,
    permissions: value.permissions,
  },
})
const baseScope = (patch = {}) => {
  const value = current(patch)
  return cardTimelineSessionScope(session(value), value.environment, value.tenantId, value.tokenIdentityMarker)
    ?? `blocked-card-timeline\u0000${value.tokenIdentityMarker}`
}
const requestScope = (patch = {}) => {
  const value = current(patch)
  return cardTimelineRequestScope(value.actorId, value.sessionExpiresAt, value.tenantId, value.environment, value.cardId, value.tokenIdentityMarker)
}

const mountedHarness = () => ({
  mounted: true,
  gate: createRequestGate(baseScope()),
  slot: { current: null },
  writes: { success: 0, error: 0, finally: 0 },
  currentToken: identity.accessToken,
  currentTokenIdentityMarker: identity.tokenIdentityMarker,
  invalidatedSessions: 0,
})

const start = (harness, scope = requestScope()) => {
  const ticket = beginRequest(harness.gate, scope)
  const controller = replaceRequestAbort(harness.slot)
  const capturedToken = identity.accessToken
  const capturedTokenIdentityMarker = identity.tokenIdentityMarker
  const accepts = () => harness.slot.current === controller
    && acceptsMountedResponse(harness.mounted, harness.gate, ticket, scope)
    && harness.currentToken === capturedToken
    && harness.currentTokenIdentityMarker === capturedTokenIdentityMarker
    && cardTimelineSessionReadAllowed(session(identity), identity.environment, identity.tenantId)
  const settle = (kind) => { if (accepts()) harness.writes[kind] += 1 }
  const invalidateSession = (expectedToken) => {
    if (harness.currentToken === expectedToken) harness.invalidatedSessions += 1
  }
  return { accepts, capturedToken, controller, invalidateSession, settle }
}

const event = (id, occurredAt) => ({
  id, type: 'FROZEN', fromStatus: 'ACTIVE', toStatus: 'FROZEN', occurredAt,
})
const cursor = (id, occurredAt) => `${Buffer.from(JSON.stringify({ v: 1, t: occurredAt, k: 'EVENT', i: id })).toString('base64url')}.${Buffer.alloc(32, 1).toString('base64url')}`

test('same-scope manual refresh has a single mounted response writer', () => {
  const harness = mountedHarness()
  const first = start(harness)
  const second = start(harness)
  assert.equal(first.controller.signal.aborted, true)
  assert.equal(first.accepts(), false)
  assert.equal(second.accepts(), true)
  first.settle('success')
  first.settle('error')
  first.settle('finally')
  second.settle('success')
  second.settle('finally')
  assert.deepEqual(harness.writes, { success: 1, error: 0, finally: 1 })
})

test('actor, session, token, tenant, environment, Card, unmount and repeat abort late writes', () => {
  const invalidations = [
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ actorId: 'admin-2' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ sessionExpiresAt: '2099-02-01T00:00:00.000Z' })),
    (harness) => {
      harness.currentToken = 'token-rotated'
      harness.currentTokenIdentityMarker = 'token-marker-rotated'
      transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ accessToken: 'token-rotated', tokenIdentityMarker: 'token-marker-rotated' }))
    },
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ tenantId: 'tenant-2' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ environment: 'SANDBOX' })),
    (harness) => { abortCurrentRequest(harness.slot); invalidateRequests(harness.gate) },
    (harness) => { harness.mounted = false; abortCurrentRequest(harness.slot); invalidateRequests(harness.gate) },
    (harness) => { start(harness) },
  ]
  for (const invalidate of invalidations) {
    const harness = mountedHarness()
    const pending = start(harness)
    invalidate(harness)
    assert.equal(pending.controller.signal.aborted, true)
    assert.equal(pending.accepts(), false)
    pending.settle('success')
    pending.settle('error')
    pending.settle('finally')
    assert.deepEqual(harness.writes, { success: 0, error: 0, finally: 0 })
  }
})

test('atomic refresh preserves the previous verified snapshot if a later page fails', () => {
  const scope = cardTimelineCollectionScope(identity.actorId, identity.sessionExpiresAt, identity.tenantId, identity.environment, identity.cardId, identity.tokenIdentityMarker)
  const previousSnapshot = Object.freeze([event('evt-old', '2026-07-30T00:00:00.000Z')])
  let visibleSnapshot = previousSnapshot
  let candidate = createAdminCardTimelineFeed(scope)
  const next = cursor('evt-1', '2026-07-31T00:00:00.000Z')
  candidate = appendAdminCardTimelinePage(candidate, parseAdminCardTimelinePage(JSON.stringify({
    events: [event('evt-1', '2026-07-31T00:00:00.000Z')], nextCursor: next,
  })), null, scope)
  assert.equal(visibleSnapshot, previousSnapshot)

  assert.throws(() => {
    const invalidSecondPage = parseAdminCardTimelinePage(JSON.stringify({
      events: [{ ...event('evt-2', '2026-07-30T23:59:00.000Z'), provider: 'THREDD' }],
      nextCursor: null,
    }))
    candidate = appendAdminCardTimelinePage(candidate, invalidSecondPage, next, scope)
    visibleSnapshot = candidate.events
  }, /could not be verified/)
  assert.equal(visibleSnapshot, previousSnapshot)
})

test('current 401 clears and invalidates only the matching session; current 403/404 only clear', () => {
  for (const status of [401, 403, 404]) {
    const harness = mountedHarness()
    const pending = start(harness)
    let visibleSnapshot = Object.freeze([event('evt-old', '2026-07-30T00:00:00.000Z')])
    if (pending.accepts() && cardTimelineShouldClearSnapshot({ status })) visibleSnapshot = null
    if (pending.accepts() && cardTimelineShouldInvalidateSession({ status })) {
      pending.invalidateSession(pending.capturedToken)
    }
    pending.settle('error')
    assert.equal(visibleSnapshot, null)
    assert.equal(harness.writes.error, 1)
    assert.equal(harness.invalidatedSessions, status === 401 ? 1 : 0)
  }
})

test('old-token success, error, 401 and finally are zero-write and cannot invalidate the rotated session', () => {
  const harness = mountedHarness()
  const pending = start(harness)
  let visibleSnapshot = Object.freeze([event('evt-old', '2026-07-30T00:00:00.000Z')])
  harness.currentToken = 'token-rotated'
  harness.currentTokenIdentityMarker = 'token-marker-rotated'
  transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ accessToken: 'token-rotated', tokenIdentityMarker: 'token-marker-rotated' }))
  if (pending.accepts() && cardTimelineShouldClearSnapshot({ status: 401 })) visibleSnapshot = null
  if (pending.accepts() && cardTimelineShouldInvalidateSession({ status: 401 })) {
    pending.invalidateSession(pending.capturedToken)
  }
  pending.settle('success')
  pending.settle('error')
  pending.settle('finally')
  assert.equal(visibleSnapshot.length, 1)
  assert.deepEqual(harness.writes, { success: 0, error: 0, finally: 0 })
  assert.equal(harness.invalidatedSessions, 0)
})

test('Card History implementation is read-only, atomic, bounded and locally gated', () => {
  const source = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const productionApi = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  const workspace = source.slice(source.indexOf('function CardWorkspace('), source.indexOf('function OperationsWorkspace('))
  const historyBranch = workspace.slice(workspace.indexOf("if (action === 'history') {"), workspace.indexOf('let value: unknown'))

  assert.match(workspace, /if \(action !== 'history' && !snapshotAction\) setView\(null\)/)
  assert.match(historyBranch, /createAdminCardTimelineFeed/)
  assert.match(historyBranch, /parseAdminCardTimelinePage/)
  assert.match(historyBranch, /appendAdminCardTimelinePage/)
  assert.match(historyBranch, /do \{[\s\S]*\} while \(next !== null\)/)
  assert.equal(historyBranch.includes('setView('), true)
  assert.match(source, /current\?\.accessToken === expectedAccessToken \? null : current/)
  assert.match(workspace, /currentToken\.current === capturedToken/)
  assert.match(workspace, /tokenIdentity\.current\?\.marker === capturedTokenMarker/)
  assert.match(workspace, /cardTimelineShouldInvalidateSession\(error\)/)
  assert.match(workspace, /invalidateSessionRef\.current\(capturedToken\)/)
  assert.equal(historyBranch.includes('logout'), false)
  assert.equal(historyBranch.includes('freezeCard'), false)
  assert.equal(historyBranch.includes('unfreezeCard'), false)
  assert.equal(historyBranch.includes('provider'), false)
  assert.match(workspace, /cardTimelineSessionReadAllowed/)
  assert.match(workspace, /cardTimelineSessionScope/)
  assert.match(workspace, /action === 'history' && cardTimelineShouldClearSnapshot\(error\)/)
  assert.match(workspace, /data-card-timeline-blocked="environment-or-session"/)
  assert.match(productionApi, /cardTimeline:[^\n]+apiRequest<string>\([^\n]+key,'GET',undefined/)
  assert.match(productionApi, /credentials:'omit'/)
  assert.match(productionApi, /Authorization:`Bearer \$\{token\}`/)
  assert.equal(productionApi.includes("cardTimeline:"), true)
  assert.equal(productionApi.slice(productionApi.indexOf('cardTimeline:'), productionApi.indexOf('cardTransactions:')).includes("'POST'"), false)
})

test('expired, cross-tenant, unauthorized, UAT and PRODUCTION sessions yield no request and no UI writes', () => {
  for (const value of [
    current({ sessionExpiresAt: '2020-01-01T00:00:00.000Z' }),
    current({ tenantId: 'tenant-2' }),
    current({ permissions: ['platform:tenants:write'] }),
    current({ accessToken: '   ' }),
    current({ environment: 'UAT' }),
    current({ environment: 'PRODUCTION' }),
  ]) {
    const allowed = cardTimelineSessionReadAllowed(session(value), value.environment, value.tenantId)
    const effects = { requests: 0, writes: 0 }
    if (allowed) {
      effects.requests += 1
      effects.writes += 1
    }
    assert.deepEqual(effects, { requests: 0, writes: 0 })
  }
})
