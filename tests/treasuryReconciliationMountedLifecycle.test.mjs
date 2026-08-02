import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import {
  acceptsMountedResponse,
  beginRequest,
  replaceRequestAbort,
} from '../src/requestGeneration.ts'
import {
  treasuryDashboardScope,
  treasurySessionReadAllowed,
} from '../src/treasuryReconciliationContract.ts'
import { useScopedRequestLifecycle } from '../src/useScopedRequestLifecycle.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const session = (patch = {}) => ({
  accessToken: 'token',
  expiresAt: '2026-08-01T01:00:00.000Z',
  user: {
    id: 'admin-1', tenantId: 'home-tenant', environment: 'TEST', roles: ['ADMIN'], permissions: ['treasury:read'],
    ...patch,
  },
})

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

function MountedTreasuryProbe({ identity, tenantId, pending, clock, writes }) {
  const environment = identity.user.environment
  const tokenScope = useRef(null)
  if (!tokenScope.current || tokenScope.current.accessToken !== identity.accessToken) {
    tokenScope.current = { accessToken: identity.accessToken, marker: crypto.randomUUID() }
  }
  const baseScope = `${treasuryDashboardScope(identity, tenantId, environment)}\u0000${tokenScope.current.marker}`
  const currentBaseScope = useRef(baseScope)
  currentBaseScope.current = baseScope
  const currentAccessToken = useRef(identity.accessToken)
  currentAccessToken.current = identity.accessToken
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('idle')

  const start = () => {
    const ticket = beginRequest(lifecycle.requestGate.current, baseScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    writes.controllers.push(controller)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentAccessToken.current === identity.accessToken
      && treasurySessionReadAllowed(identity, environment, clock.now)
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, baseScope)
    setBusy(true)
    setResult('idle')
    pending.promise.then(
      () => { if (isCurrent()) { writes.success += 1; setResult('success') } },
      () => { if (isCurrent()) { writes.error += 1; setResult('error') } },
    ).finally(() => { if (isCurrent()) { writes.finally += 1; setBusy(false) } })
  }

  return createElement('treasury-probe', { busy, result }, createElement('button', { id: 'start', onClick: start }))
}

const writes = () => ({ success: 0, error: 0, finally: 0, controllers: [] })
const mount = async (props) => {
  let renderer
  await act(async () => { renderer = create(createElement(MountedTreasuryProbe, props)) })
  return renderer
}
const click = async (renderer) => act(async () => renderer.root.findByProps({ id: 'start' }).props.onClick())
const settle = async (pending, outcome) => act(async () => {
  if (outcome === 'success') pending.resolve('ok')
  else pending.reject(new Error('expected'))
  await pending.promise.catch(() => undefined)
  await Promise.resolve()
  await Promise.resolve()
})

test('same SANDBOX/TEST scope is the unique mounted completion writer', async () => {
  for (const outcome of ['success', 'error']) {
    const pending = deferred()
    const recorded = writes()
    const clock = { now: Date.parse('2026-08-01T00:00:00.000Z') }
    const renderer = await mount({ identity: session(), tenantId: 'tenant-1', pending, clock, writes: recorded })
    await click(renderer)
    await settle(pending, outcome)
    assert.deepEqual(
      { success: recorded.success, error: recorded.error, finally: recorded.finally },
      outcome === 'success' ? { success: 1, error: 0, finally: 1 } : { success: 0, error: 1, finally: 1 },
    )
    await act(async () => renderer.unmount())
  }
})

test('tenant, actor, token, environment, page unmount and natural expiry make late completions zero-write', async () => {
  for (const invalidation of ['tenant', 'actor', 'token', 'environment', 'unmount', 'expiry']) {
    for (const outcome of ['success', 'error']) {
      const pending = deferred()
      const recorded = writes()
      const clock = { now: Date.parse('2026-08-01T00:00:00.000Z') }
      const initial = { identity: session(), tenantId: 'tenant-1', pending, clock, writes: recorded }
      const renderer = await mount(initial)
      await click(renderer)
      const oldController = recorded.controllers[0]
      if (invalidation === 'unmount') await act(async () => renderer.unmount())
      else if (invalidation === 'expiry') {
        clock.now = Date.parse('2026-08-01T01:00:00.000Z')
        await act(async () => renderer.update(createElement(MountedTreasuryProbe, initial)))
      } else {
        const nextIdentity = invalidation === 'actor'
          ? session({ id: 'admin-2' })
          : invalidation === 'environment'
            ? session({ environment: 'SANDBOX' })
            : invalidation === 'token'
              ? { ...session(), accessToken: 'replacement-token' }
              : session()
        await act(async () => renderer.update(createElement(MountedTreasuryProbe, {
          ...initial,
          identity: nextIdentity,
          tenantId: invalidation === 'tenant' ? 'tenant-2' : 'tenant-1',
        })))
      }
      if (invalidation !== 'expiry') assert.equal(oldController.signal.aborted, true)
      await settle(pending, outcome)
      assert.deepEqual({ success: recorded.success, error: recorded.error, finally: recorded.finally }, { success: 0, error: 0, finally: 0 })
      if (invalidation !== 'unmount') await act(async () => renderer.unmount())
    }
  }
})

test('production component uses the tested mounted, scope and live-expiry predicates for all completions', () => {
  const source = readFileSync(new URL('../src/TreasuryReconciliationWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(source, /useScopedRequestLifecycle\(baseScope\)/)
  assert.match(source, /currentBaseScope\.current === baseScope/)
  assert.match(source, /currentAccessToken\.current === session\.accessToken/)
  assert.match(source, /treasurySessionReadAllowed\(session, environment, now\(\)\)/)
  assert.match(source, /acceptsMountedResponse\(lifecycle\.mounted\.current/)
  assert.match(source, /Promise\.allSettled/)
  assert.match(source, /publishEndpoint\(\{ reconciliation:/)
  assert.match(source, /publishEndpoint\(\{ trialBalance:/)
  assert.match(source, /publishEndpoint\(\{ dailyClosing:/)
  assert.match(source, /controller\.signal/)
  assert.equal(source.includes("method:'POST'"), false)
})
