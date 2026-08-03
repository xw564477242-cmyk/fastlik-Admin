import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import {
  parseTreasuryFundsInstructionReceipt,
  treasuryFundsBaseScope,
  treasuryFundsFailurePolicy,
  TreasuryFundsInstructionContractError,
  treasuryFundsLookupScope,
  treasuryFundsSessionReadAllowed,
} from '../src/treasuryFundsInstructionContract.ts'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from '../src/requestGeneration.ts'
import { useScopedRequestLifecycle } from '../src/useScopedRequestLifecycle.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const receipt = (operationId = 'operation-0001') => JSON.stringify({
  instructionId: 'instruction-20260803-0001', operationId, status: 'COMPLETED', direction: 'INFLOW',
  assetCode: 'USD', amountMinor: '12500', completedAt: '2026-08-03T01:02:03.456Z',
  journal: {
    id: 'journal-0001', status: 'POSTED', entries: [
      { accountRole: 'CLEARING', side: 'CREDIT', assetCode: 'USD', amountMinor: '12500' },
      { accountRole: 'TREASURY', side: 'DEBIT', assetCode: 'USD', amountMinor: '12500' },
    ],
  },
  treasury: { availableBalanceMinor: '12500', version: 1 }, auditRecorded: true,
})

const session = (patch = {}) => ({
  accessToken: 't'.repeat(32), expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'admin-1', tenantId: 'tenant-1', environment: 'TEST', roles: ['ADMIN'], permissions: ['admin:read'], ...patch },
})

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const writes = () => ({ calls: 0, success: 0, error: 0, finally: 0, cleared: 0, invalidated: 0, controllers: [] })

function MountedReceiptProbe({ identity, runtimeEnvironment, tenantId, operationId, pending, clock, recorded, initial = 'EMPTY' }) {
  const sessionIdentity = useRef(null)
  if (!sessionIdentity.current || sessionIdentity.current.session !== identity) {
    sessionIdentity.current = { session: identity, marker: crypto.randomUUID() }
  }
  const identityScope = treasuryFundsBaseScope(identity, runtimeEnvironment, tenantId, clock.now)
  const baseScope = `${identityScope ?? 'TREASURY_FUNDS_BLOCKED'}\u0000${sessionIdentity.current.marker}`
  const lookupScope = treasuryFundsLookupScope(identityScope, operationId)
  const requestScope = lookupScope ? `${lookupScope}\u0000${sessionIdentity.current.marker}` : null
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const currentBaseScope = useRef(baseScope)
  const currentRequestScope = useRef(requestScope)
  const currentToken = useRef(identity.accessToken)
  currentBaseScope.current = baseScope
  currentRequestScope.current = requestScope
  currentToken.current = identity.accessToken
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(initial)

  const start = () => {
    if (!requestScope || !treasuryFundsSessionReadAllowed(identity, runtimeEnvironment, tenantId, clock.now)) return
    const ticket = beginRequest(lifecycle.requestGate.current, requestScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const capturedToken = identity.accessToken
    recorded.calls += 1
    recorded.controllers.push(controller)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentRequestScope.current === requestScope
      && currentToken.current === capturedToken
      && treasuryFundsSessionReadAllowed(identity, runtimeEnvironment, tenantId, clock.now)
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, requestScope)
    setBusy(true)
    pending.promise.then(
      (raw) => {
        const value = parseTreasuryFundsInstructionReceipt(raw, operationId)
        if (isCurrent()) { recorded.success += 1; setResult(value.instructionId) }
      },
      (reason) => {
        if (!isCurrent()) return
        recorded.error += 1
        const policy = treasuryFundsFailurePolicy(reason)
        if (policy.clearSnapshot || reason instanceof TreasuryFundsInstructionContractError) { recorded.cleared += 1; setResult('CLEARED') }
        if (policy.invalidateSession) recorded.invalidated += 1
      },
    ).catch((reason) => {
      if (!isCurrent()) return
      recorded.error += 1
      if (reason instanceof TreasuryFundsInstructionContractError) { recorded.cleared += 1; setResult('CLEARED') }
    }).finally(() => { if (isCurrent()) { recorded.finally += 1; setBusy(false) } })
  }
  const changeLookup = () => {
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setResult('CLEARED')
    setBusy(false)
  }
  return createElement('receipt-probe', { busy, result },
    createElement('button', { id: 'start', onClick: start }),
    createElement('button', { id: 'lookup-change', onClick: changeLookup }),
  )
}

const mount = async (props) => {
  let renderer
  await act(async () => { renderer = create(createElement(MountedReceiptProbe, props)) })
  return renderer
}
const click = async (renderer, id = 'start') => act(async () => renderer.root.findByProps({ id }).props.onClick())
const settle = async (pending, outcome, value) => act(async () => {
  if (outcome === 'success') pending.resolve(value)
  else pending.reject(value)
  await pending.promise.catch(() => undefined)
  await Promise.resolve()
  await Promise.resolve()
})

for (const environment of ['SANDBOX', 'TEST']) {
  test(`${environment} publishes only the exact current immutable receipt`, async () => {
    const pending = deferred()
    const recorded = writes()
    const renderer = await mount({
      identity: session({ environment }), runtimeEnvironment: environment, tenantId: 'tenant-1', operationId: 'operation-0001',
      pending, clock: { now: Date.parse('2026-08-03T00:00:00.000Z') }, recorded,
    })
    await click(renderer)
    assert.equal(recorded.calls, 1)
    assert.equal(recorded.controllers[0].signal.aborted, false)
    await settle(pending, 'success', receipt())
    assert.equal(renderer.root.findByType('receipt-probe').props.result, 'instruction-20260803-0001')
    assert.deepEqual({ success: recorded.success, finally: recorded.finally }, { success: 1, finally: 1 })
    await act(async () => renderer.unmount())
  })
}

test('operation change aborts the request and late completion performs zero writes', async () => {
  const pending = deferred()
  const recorded = writes()
  const props = {
    identity: session(), runtimeEnvironment: 'TEST', tenantId: 'tenant-1', operationId: 'operation-0001',
    pending, clock: { now: Date.parse('2026-08-03T00:00:00.000Z') }, recorded,
  }
  const renderer = await mount(props)
  await click(renderer)
  await click(renderer, 'lookup-change')
  assert.equal(recorded.controllers[0].signal.aborted, true)
  await settle(pending, 'success', receipt())
  assert.deepEqual({ success: recorded.success, error: recorded.error, finally: recorded.finally }, { success: 0, error: 0, finally: 0 })
  await act(async () => renderer.unmount())
})

test('session identity, token, tenant, environment, expiry and unmount reject all late outcomes', async () => {
  for (const invalidation of ['session', 'token', 'tenant', 'environment', 'expiry', 'unmount']) {
    for (const outcome of ['success', 'error', '401']) {
      const pending = deferred()
      const recorded = writes()
      const clock = { now: Date.parse('2026-08-03T00:00:00.000Z') }
      const original = session()
      const props = { identity: original, runtimeEnvironment: 'TEST', tenantId: 'tenant-1', operationId: 'operation-0001', pending, clock, recorded }
      const renderer = await mount(props)
      await click(renderer)
      const oldController = recorded.controllers[0]
      if (invalidation === 'unmount') await act(async () => renderer.unmount())
      else if (invalidation === 'expiry') {
        clock.now = Date.parse('2099-01-01T00:00:00.000Z')
        await act(async () => renderer.update(createElement(MountedReceiptProbe, props)))
      } else {
        const next = {
          ...props,
          identity: invalidation === 'session'
            ? { ...original }
            : invalidation === 'token'
              ? { ...original, accessToken: 'u'.repeat(32) }
              : invalidation === 'environment'
                ? session({ environment: 'SANDBOX' })
                : original,
          tenantId: invalidation === 'tenant' ? 'tenant-2' : 'tenant-1',
          runtimeEnvironment: invalidation === 'environment' ? 'SANDBOX' : 'TEST',
        }
        await act(async () => renderer.update(createElement(MountedReceiptProbe, next)))
      }
      if (invalidation !== 'expiry') assert.equal(oldController.signal.aborted, true)
      const failure = outcome === '401' ? Object.assign(new Error('private'), { status: 401 }) : new Error('private')
      await settle(pending, outcome === 'success' ? 'success' : 'error', outcome === 'success' ? receipt() : failure)
      assert.deepEqual(
        { success: recorded.success, error: recorded.error, finally: recorded.finally, cleared: recorded.cleared, invalidated: recorded.invalidated },
        { success: 0, error: 0, finally: 0, cleared: 0, invalidated: 0 },
      )
      if (invalidation !== 'unmount') await act(async () => renderer.unmount())
    }
  }
})

test('current 401, 403, 404 and contract drift clear the snapshot; only 401 invalidates', async () => {
  for (const status of [401, 403, 404, 'contract']) {
    const pending = deferred()
    const recorded = writes()
    const renderer = await mount({
      identity: session(), runtimeEnvironment: 'TEST', tenantId: 'tenant-1', operationId: 'operation-0001', pending,
      clock: { now: Date.parse('2026-08-03T00:00:00.000Z') }, recorded, initial: 'VERIFIED',
    })
    await click(renderer)
    if (status === 'contract') await settle(pending, 'success', receipt('operation-other'))
    else await settle(pending, 'error', Object.assign(new Error('private'), { status }))
    assert.equal(renderer.root.findByType('receipt-probe').props.result, 'CLEARED')
    assert.equal(recorded.invalidated, status === 401 ? 1 : 0)
    await act(async () => renderer.unmount())
  }
})

test('missing permissions, unauthorized cross-tenant scope, production and invalid ID execute zero reads', async () => {
  const cases = [
    { identity: session(), runtimeEnvironment: 'PRODUCTION', tenantId: 'tenant-1', operationId: 'operation-0001' },
    { identity: session({ permissions: ['treasury:read'] }), runtimeEnvironment: 'TEST', tenantId: 'tenant-1', operationId: 'operation-0001' },
    { identity: session(), runtimeEnvironment: 'TEST', tenantId: 'tenant-2', operationId: 'operation-0001' },
    { identity: session(), runtimeEnvironment: 'TEST', tenantId: 'tenant-1', operationId: 'operation/id' },
  ]
  for (const current of cases) {
    const recorded = writes()
    const renderer = await mount({ ...current, pending: deferred(), clock: { now: Date.parse('2026-08-03T00:00:00.000Z') }, recorded })
    await click(renderer)
    assert.equal(recorded.calls, 0)
    await act(async () => renderer.unmount())
  }
})

test('production source exposes one bounded abortable GET and no mutation client or control', () => {
  const panel = readFileSync(new URL('../src/TreasuryJournalReceiptPanel.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
  assert.match(panel, /treasuryFundsSessionReadAllowed/)
  assert.match(panel, /acceptsMountedResponse\(lifecycle\.mounted\.current/)
  assert.match(panel, /controller\.signal/)
  assert.match(panel, /data-treasury-action="receipt-read"/)
  assert.equal(panel.includes('productionApi.journals'), false)
  assert.equal(panel.includes("'POST'"), false)
  assert.match(api, /treasuryFundsInstruction:[^\n]+,'GET',undefined,\{format:'bounded-text'/)
  assert.equal(/treasuryFundsInstruction:[^\n]+,'POST'/.test(api), false)
})
