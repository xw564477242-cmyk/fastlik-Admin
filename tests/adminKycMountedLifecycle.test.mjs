import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import {
  adminKycBaseScope,
  adminKycLookupScope,
  adminKycSessionReadAllowed,
} from '../src/adminKycContract.ts'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from '../src/requestGeneration.ts'
import { useScopedRequestLifecycle } from '../src/useScopedRequestLifecycle.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const session = (patch = {}) => ({
  accessToken: 'token-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'admin-1', tenantId: 'home-tenant', environment: 'TEST', roles: ['ADMIN'], permissions: ['kyc:read'],
    ...patch,
  },
})
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const writes = () => ({ calls: 0, success: 0, error: 0, finally: 0, controllers: [] })

function MountedKycProbe({ identity, runtimeEnvironment, tenantId, userId, tab = 'user', pending, clock, recorded, initialSnapshot = 'PENDING' }) {
  const tokenIdentity = useRef(null)
  if (!tokenIdentity.current || tokenIdentity.current.token !== identity.accessToken) {
    tokenIdentity.current = { token: identity.accessToken, marker: crypto.randomUUID() }
  }
  const identityScope = adminKycBaseScope(identity, runtimeEnvironment, tenantId, tab, clock.now)
  const baseScope = `${identityScope ?? 'ADMIN_KYC_BLOCKED'}\u0000${tokenIdentity.current.marker}`
  const lookupScope = adminKycLookupScope(identityScope, userId)
  const requestScope = lookupScope ? `${lookupScope}\u0000${tokenIdentity.current.marker}` : null
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const currentBaseScope = useRef(baseScope)
  const currentLookupScope = useRef(requestScope)
  const currentToken = useRef(identity.accessToken)
  currentBaseScope.current = baseScope
  currentLookupScope.current = requestScope
  currentToken.current = identity.accessToken
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(initialSnapshot)

  const start = () => {
    if (!requestScope || !adminKycSessionReadAllowed(identity, runtimeEnvironment, tenantId, tab, clock.now)) return
    const ticket = beginRequest(lifecycle.requestGate.current, requestScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    recorded.calls += 1
    recorded.controllers.push(controller)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentLookupScope.current === requestScope
      && currentToken.current === identity.accessToken
      && adminKycSessionReadAllowed(identity, runtimeEnvironment, tenantId, tab, clock.now)
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, requestScope)
    setBusy(true)
    pending.promise.then(
      (value) => { if (isCurrent()) { recorded.success += 1; setResult(value) } },
      () => { if (isCurrent()) { recorded.error += 1; setResult((current) => current) } },
    ).finally(() => { if (isCurrent()) { recorded.finally += 1; setBusy(false) } })
  }
  const changeLookup = () => {
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setResult('CLEARED')
    setBusy(false)
  }
  return createElement('kyc-probe', { busy, result },
    createElement('button', { id: 'start', onClick: start }),
    createElement('button', { id: 'lookup-change', onClick: changeLookup }),
  )
}

const mount = async (props) => {
  let renderer
  await act(async () => { renderer = create(createElement(MountedKycProbe, props)) })
  return renderer
}
const click = async (renderer, id = 'start') => act(async () => renderer.root.findByProps({ id }).props.onClick())
const settle = async (pending, outcome, value = 'APPROVED') => act(async () => {
  if (outcome === 'success') pending.resolve(value)
  else pending.reject(new Error('private upstream failure'))
  await pending.promise.catch(() => undefined)
  await Promise.resolve()
  await Promise.resolve()
})

for (const environment of ['SANDBOX', 'TEST']) {
  test(`one ${environment} query atomically replaces only after success and failure retains the same-scope snapshot`, async () => {
    const identity = session({ environment })
    const clock = { now: Date.parse('2026-08-02T00:00:00.000Z') }
    const pending = deferred()
    const recorded = writes()
    const props = { identity, runtimeEnvironment: environment, tenantId: 'tenant-1', userId: 'user-1', pending, clock, recorded }
    const renderer = await mount(props)
    await click(renderer)
    assert.equal(renderer.root.findByType('kyc-probe').props.result, 'PENDING')
    await settle(pending, 'success')
    assert.equal(renderer.root.findByType('kyc-probe').props.result, 'APPROVED')
    assert.deepEqual({ calls: recorded.calls, success: recorded.success, finally: recorded.finally }, { calls: 1, success: 1, finally: 1 })
    await act(async () => renderer.unmount())

    const failed = deferred()
    const failureWrites = writes()
    const failureRenderer = await mount({ ...props, pending: failed, recorded: failureWrites })
    await click(failureRenderer)
    await settle(failed, 'error')
    assert.equal(failureRenderer.root.findByType('kyc-probe').props.result, 'PENDING')
    assert.deepEqual({ calls: failureWrites.calls, error: failureWrites.error, finally: failureWrites.finally }, { calls: 1, error: 1, finally: 1 })
    await act(async () => failureRenderer.unmount())
  })
}

test('repeat query aborts the old request and its late success, error and finally perform zero writes', async () => {
  for (const outcome of ['success', 'error']) {
    const first = deferred()
    const second = deferred()
    const recorded = writes()
    const clock = { now: Date.parse('2026-08-02T00:00:00.000Z') }
    const props = { identity: session(), runtimeEnvironment: 'TEST', tenantId: 'tenant-1', userId: 'user-1', pending: first, clock, recorded }
    const renderer = await mount(props)
    await click(renderer)
    const oldController = recorded.controllers[0]
    await act(async () => renderer.update(createElement(MountedKycProbe, { ...props, pending: second })))
    await click(renderer)
    assert.equal(oldController.signal.aborted, true)
    await settle(first, outcome)
    assert.deepEqual({ success: recorded.success, error: recorded.error, finally: recorded.finally }, { success: 0, error: 0, finally: 0 })
    await act(async () => renderer.unmount())
  }
})

test('lookup, session, token, tenant, environment, tab, expiry and mount changes reject every late completion', async () => {
  for (const invalidation of ['lookup', 'session', 'token', 'tenant', 'environment', 'tab', 'expiry', 'unmount']) {
    for (const outcome of ['success', 'error']) {
      const pending = deferred()
      const recorded = writes()
      const clock = { now: Date.parse('2026-08-02T00:00:00.000Z') }
      const props = { identity: session(), runtimeEnvironment: 'TEST', tenantId: 'tenant-1', userId: 'user-1', pending, clock, recorded }
      const renderer = await mount(props)
      await click(renderer)
      const oldController = recorded.controllers[0]
      if (invalidation === 'lookup') await click(renderer, 'lookup-change')
      else if (invalidation === 'unmount') await act(async () => renderer.unmount())
      else if (invalidation === 'expiry') {
        clock.now = Date.parse('2099-01-01T00:00:00.000Z')
        await act(async () => renderer.update(createElement(MountedKycProbe, props)))
      } else {
        const next = {
          ...props,
          identity: invalidation === 'session'
            ? session({ id: 'admin-2' })
            : invalidation === 'token'
              ? { ...session(), accessToken: 'token-2' }
              : invalidation === 'environment'
                ? session({ environment: 'SANDBOX' })
                : props.identity,
          runtimeEnvironment: invalidation === 'environment' ? 'SANDBOX' : props.runtimeEnvironment,
          tenantId: invalidation === 'tenant' ? 'tenant-2' : props.tenantId,
          tab: invalidation === 'tab' ? 'trace' : 'user',
        }
        await act(async () => renderer.update(createElement(MountedKycProbe, next)))
      }
      if (invalidation !== 'expiry') assert.equal(oldController.signal.aborted, true)
      await settle(pending, outcome)
      assert.deepEqual({ success: recorded.success, error: recorded.error, finally: recorded.finally }, { success: 0, error: 0, finally: 0 })
      if (invalidation !== 'unmount') await act(async () => renderer.unmount())
    }
  }
})

test('production, local, UAT, unknown and mismatch execute zero readers', async () => {
  for (const runtimeEnvironment of ['PRODUCTION', 'LOCAL', 'UAT', undefined, 'SANDBOX']) {
    const pending = deferred()
    const recorded = writes()
    const renderer = await mount({
      identity: session(), runtimeEnvironment, tenantId: 'tenant-1', userId: 'user-1', pending,
      clock: { now: Date.parse('2026-08-02T00:00:00.000Z') }, recorded,
    })
    await click(renderer)
    assert.equal(recorded.calls, 0)
    await act(async () => renderer.unmount())
  }
})

test('one-character and colon tenant or user identifiers execute zero readers', async () => {
  for (const [tenantId, userId] of [['t', 'user-1'], ['tenant:one', 'user-1'], ['tenant-1', 'u'], ['tenant-1', 'user:one']]) {
    const pending = deferred()
    const recorded = writes()
    const renderer = await mount({
      identity: session(), runtimeEnvironment: 'TEST', tenantId, userId, pending,
      clock: { now: Date.parse('2026-08-02T00:00:00.000Z') }, recorded,
    })
    await click(renderer)
    assert.equal(recorded.calls, 0)
    await act(async () => renderer.unmount())
  }
})

test('production panel uses the mounted predicates, abortable reader and exact three-field UI only', () => {
  const panel = readFileSync(new URL('../src/AdminKycPanel.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  assert.match(panel, /useScopedRequestLifecycle\(baseScope\)/)
  assert.match(panel, /replaceRequestAbort\(lifecycle\.requestAbort\)/)
  assert.match(panel, /currentBaseScope\.current === baseScope/)
  assert.match(panel, /currentLookupScope\.current === requestScope/)
  assert.match(panel, /currentToken\.current === capturedToken/)
  assert.match(panel, /adminKycSessionReadAllowed/)
  assert.match(panel, /acceptsMountedResponse/)
  assert.match(panel, /controller\.signal/)
  assert.match(panel, /EXACT 3 FIELDS/)
  assert.equal(panel.includes('DataCard'), false)
  assert.equal(panel.includes('providerRef'), false)
  assert.equal(panel.includes('wallets'), false)
  assert.equal(app.includes('productionApi.user('), false)
  assert.match(app, /tab === 'user' && <AdminKycPanel/)
})
