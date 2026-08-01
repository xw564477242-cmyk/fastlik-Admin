import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  cardTransactionDetailScope,
  cardTransactionRequestScope,
} from '../src/cardTransactionContract.ts'
import { cardWorkspaceBaseScope } from '../src/cardWorkspaceContract.ts'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  replaceRequestAbort,
  transitionRequestBaseScope,
} from '../src/requestGeneration.ts'

const query = { status: 'ALL', limit: 25 }
const identity = Object.freeze({
  actorId: 'admin-1',
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
  tenantId: 'tenant-1',
  environment: 'TEST',
  cardId: 'card-1',
})
const baseScope = (patch = {}) => {
  const current = { ...identity, ...patch }
  return cardWorkspaceBaseScope(current.actorId, current.sessionExpiresAt, current.tenantId, current.environment, 'card')
}
const listScope = (patch = {}) => {
  const current = { ...identity, ...patch }
  return cardTransactionRequestScope(current.actorId, current.sessionExpiresAt, current.tenantId, current.environment, current.cardId, current.query ?? query, current.cursor ?? null)
}
const detailScope = (patch = {}) => {
  const current = { ...identity, ...patch }
  return cardTransactionDetailScope(current.actorId, current.sessionExpiresAt, current.tenantId, current.environment, current.cardId, current.query ?? query, current.transactionId ?? 'txn-1')
}

const mountedHarness = () => ({
  mounted: true,
  gate: createRequestGate(baseScope()),
  slot: { current: null },
  writes: { success: 0, error: 0, finally: 0 },
})

const start = (harness, scope) => {
  const ticket = beginRequest(harness.gate, scope)
  const controller = replaceRequestAbort(harness.slot)
  const current = () => harness.slot.current === controller
    && acceptsMountedResponse(harness.mounted, harness.gate, ticket, scope)
  const settle = (kind) => {
    if (current()) harness.writes[kind] += 1
  }
  return { controller, current, settle, scope, ticket }
}

test('CardWorkspace render leaves an active list/detail request scope unchanged', () => {
  const source = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const workspace = source.slice(source.indexOf('function CardWorkspace('), source.indexOf('function OperationsWorkspace('))
  const renderPrelude = workspace.slice(0, workspace.indexOf('const run = async'))
  assert.equal(renderPrelude.includes('syncRequestScope(requestGate.current, baseScope)'), false)
  assert.match(workspace, /useEffect\(\(\) => \{\s*transitionRequestBaseScope\(requestGate\.current, transactionAbort, baseScope\)/)

  for (const scope of [listScope(), detailScope()]) {
    const harness = mountedHarness()
    const request = start(harness, scope)
    const generationBeforeBusyRender = harness.gate.generation

    // React's setBusy render must be observational only for the active request gate.
    assert.equal(request.current(), true)
    assert.equal(harness.gate.scope, scope)
    assert.equal(harness.gate.generation, generationBeforeBusyRender)

    request.settle('success')
    request.settle('finally')
    assert.deepEqual(harness.writes, { success: 1, error: 0, finally: 1 })
  }
})

test('a same-scope list or detail response is the unique mounted writer', () => {
  for (const scope of [listScope(), detailScope()]) {
    const harness = mountedHarness()
    const first = start(harness, scope)
    const second = start(harness, scope)
    assert.equal(first.controller.signal.aborted, true)
    assert.equal(first.current(), false)
    assert.equal(second.current(), true)
    first.settle('success')
    first.settle('error')
    first.settle('finally')
    second.settle('success')
    second.settle('finally')
    assert.deepEqual(harness.writes, { success: 1, error: 0, finally: 1 })
  }
})

test('Card, filter, list, actor, tenant, environment, unmount and repeat abort late list/detail writes', () => {
  const invalidations = [
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ actorId: 'admin-2' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ tenantId: 'tenant-2' })),
    (harness) => transitionRequestBaseScope(harness.gate, harness.slot, baseScope({ environment: 'SANDBOX' })),
    (harness) => { abortCurrentRequest(harness.slot); invalidateRequests(harness.gate) }, // Card change
    (harness) => { abortCurrentRequest(harness.slot); invalidateRequests(harness.gate) }, // filter change
    (harness) => { start(harness, listScope({ cursor: 'next-page' })) }, // list snapshot/generation change
    (harness) => { harness.mounted = false; abortCurrentRequest(harness.slot); invalidateRequests(harness.gate) },
    (harness, scope) => { start(harness, scope) }, // repeated request
  ]

  for (const scope of [listScope(), detailScope()]) {
    for (const invalidate of invalidations) {
      const harness = mountedHarness()
      const pending = start(harness, scope)
      invalidate(harness, scope)
      assert.equal(pending.controller.signal.aborted, true)
      assert.equal(pending.current(), false)
      pending.settle('success')
      pending.settle('error')
      pending.settle('finally')
      assert.deepEqual(harness.writes, { success: 0, error: 0, finally: 0 })
    }
  }
})
