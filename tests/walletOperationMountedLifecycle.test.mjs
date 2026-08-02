import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  replaceRequestAbort,
  transitionRequestBaseScope,
} from '../src/requestGeneration.ts'
import { walletOperationListScope } from '../src/walletOperationListContract.ts'

const query = { status: 'COMPLETED', limit: 25, offset: 0 }
const scope = (patch = {}) => {
  const value = {
    actorId: 'admin-1', expiresAt: '2099-01-01T00:00:00.000Z', tenantId: 'tenant-1', environment: 'TEST', query,
    ...patch,
  }
  return walletOperationListScope(value.actorId, value.expiresAt, value.tenantId, value.environment, value.query)
}

const start = (harness, requestScope) => {
  const ticket = beginRequest(harness.gate, requestScope)
  const controller = replaceRequestAbort(harness.abort)
  const current = () => harness.abort.current === controller
    && acceptsMountedResponse(harness.mounted, harness.gate, ticket, requestScope)
  return { controller, current }
}

test('repeat, actor, tenant, environment, filter, pagination and unmount invalidate the old writer', () => {
  const invalidations = [
    (harness) => start(harness, scope()),
    (harness) => transitionRequestBaseScope(harness.gate, harness.abort, scope({ actorId: 'admin-2' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.abort, scope({ tenantId: 'tenant-2' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.abort, scope({ environment: 'SANDBOX' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.abort, scope({ query: { ...query, status: 'FAILED' } })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.abort, scope({ query: { ...query, offset: 25 } })),
    (harness) => { harness.mounted = false; abortCurrentRequest(harness.abort); invalidateRequests(harness.gate) },
  ]
  invalidations.forEach((invalidate) => {
    const harness = { mounted: true, gate: createRequestGate(scope()), abort: { current: null } }
    const pending = start(harness, scope())
    invalidate(harness)
    assert.equal(pending.controller.signal.aborted, true)
    assert.equal(pending.current(), false)
  })
})

test('production workspace enforces mounted scope, active cancellation and non-production reads', () => {
  const source = readFileSync(new URL('../src/WalletOperationsWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(source, /useScopedRequestLifecycle\(baseScope\)/)
  assert.match(source, /currentBaseScope\.current === baseScope/)
  assert.match(source, /currentToken\.current === session\.accessToken/)
  assert.match(source, /walletOperationSessionReadAllowed\(session, tenantId, environment, now\(\)\)/)
  assert.match(source, /acceptsMountedResponse\(lifecycle\.mounted\.current/)
  assert.match(source, /replaceRequestAbort\(lifecycle\.requestAbort\)/)
  assert.match(source, /abortCurrentRequest\(lifecycle\.requestAbort\)/)
  assert.match(source, /controller\.signal/)
  assert.match(source, /environment === 'SANDBOX' \|\| environment === 'TEST'/)
  assert.equal(source.includes("method:'POST'"), false)
  assert.match(source, /error instanceof WalletOperationListContractError\) return error\.message/)
  assert.doesNotMatch(source, /error instanceof ApiError\)[\s\S]{0,900}error\.message/)
})
