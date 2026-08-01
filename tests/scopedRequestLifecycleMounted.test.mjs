import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, useState } from 'react'
import { act, create } from 'react-test-renderer'
import {
  cardTransactionDetailScope,
  cardTransactionRequestScope,
} from '../src/cardTransactionContract.ts'
import { cardWorkspaceBaseScope } from '../src/cardWorkspaceContract.ts'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from '../src/requestGeneration.ts'
import { useScopedRequestLifecycle } from '../src/useScopedRequestLifecycle.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const identity = Object.freeze({
  actorId: 'admin-1',
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
  tenantId: 'tenant-1',
  environment: 'TEST',
  cardId: 'card-1',
})
const query = Object.freeze({ status: 'ALL', limit: 25 })
const workspaceScope = (patch = {}) => {
  const value = { ...identity, ...patch }
  return cardWorkspaceBaseScope(value.actorId, value.sessionExpiresAt, value.tenantId, value.environment, 'card')
}
const listScope = () => cardTransactionRequestScope(
  identity.actorId,
  identity.sessionExpiresAt,
  identity.tenantId,
  identity.environment,
  identity.cardId,
  query,
  null,
)
const detailScope = () => cardTransactionDetailScope(
  identity.actorId,
  identity.sessionExpiresAt,
  identity.tenantId,
  identity.environment,
  identity.cardId,
  query,
  'txn-1',
)

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function MountedRequestProbe({ baseScope, requestScope, pending, writes }) {
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState('idle')

  const start = () => {
    const ticket = beginRequest(lifecycle.requestGate.current, requestScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    writes.controllers.push(controller)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, requestScope)
    setBusy('pending')
    setResult('idle')
    pending.promise.then(
      () => {
        if (isCurrent()) {
          writes.success += 1
          setResult('success')
        }
      },
      () => {
        if (isCurrent()) {
          writes.error += 1
          setResult('error')
        }
      },
    ).finally(() => {
      if (isCurrent()) {
        writes.finally += 1
        setBusy('')
      }
    })
  }
  const invalidate = () => {
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setBusy('')
    setResult('invalidated')
  }
  const supersedeList = () => {
    beginRequest(lifecycle.requestGate.current, `${requestScope}\u0000next-list-snapshot`)
    writes.controllers.push(replaceRequestAbort(lifecycle.requestAbort))
    setBusy('next-list')
    setResult('superseded')
  }

  return createElement('request-probe', { busy, result },
    createElement('button', { id: 'start', onClick: start }),
    createElement('button', { id: 'invalidate-card', onClick: invalidate }),
    createElement('button', { id: 'invalidate-filter', onClick: invalidate }),
    createElement('button', { id: 'supersede-list', onClick: supersedeList }),
  )
}

const emptyWrites = () => ({ success: 0, error: 0, finally: 0, controllers: [] })
const mounted = async (requestScope, pending, writes, baseScope = workspaceScope()) => {
  let renderer
  await act(async () => {
    renderer = create(createElement(MountedRequestProbe, { baseScope, requestScope, pending, writes }))
  })
  return renderer
}
const click = async (renderer, id) => {
  await act(async () => renderer.root.findByProps({ id }).props.onClick())
}
const settle = async (pending, outcome) => {
  await act(async () => {
    if (outcome === 'success') pending.resolve('ok')
    else pending.reject(new Error('expected test failure'))
    await pending.promise.catch(() => undefined)
    await Promise.resolve()
    await Promise.resolve()
  })
}

test('mounted list/detail requests survive their real setBusy rerender and commit exactly once', async () => {
  for (const requestScope of [listScope(), detailScope()]) {
    for (const outcome of ['success', 'error']) {
      const pending = deferred()
      const writes = emptyWrites()
      const renderer = await mounted(requestScope, pending, writes)
      await click(renderer, 'start')

      assert.equal(renderer.root.findByType('request-probe').props.busy, 'pending')
      assert.equal(writes.controllers.length, 1)
      assert.equal(writes.controllers[0].signal.aborted, false)
      await settle(pending, outcome)

      assert.equal(renderer.root.findByType('request-probe').props.busy, '')
      assert.equal(renderer.root.findByType('request-probe').props.result, outcome)
      assert.deepEqual(
        { success: writes.success, error: writes.error, finally: writes.finally },
        outcome === 'success'
          ? { success: 1, error: 0, finally: 1 }
          : { success: 0, error: 1, finally: 1 },
      )
      await act(async () => renderer.unmount())
    }
  }
})

test('mounted Card/filter/list/actor/tenant/environment/repeat/unmount invalidations make every late completion a zero-write', async () => {
  const invalidations = [
    'cardId',
    'filter',
    'listSnapshot',
    'actorId',
    'tenantId',
    'environment',
    'repeat',
    'unmount',
  ]
  for (const requestScope of [listScope(), detailScope()]) {
    for (const invalidation of invalidations) {
      for (const outcome of ['success', 'error']) {
        const pending = deferred()
        const writes = emptyWrites()
        const renderer = await mounted(requestScope, pending, writes)
        await click(renderer, 'start')
        const oldController = writes.controllers[0]

        if (invalidation === 'cardId') await click(renderer, 'invalidate-card')
        else if (invalidation === 'filter') await click(renderer, 'invalidate-filter')
        else if (invalidation === 'listSnapshot') await click(renderer, 'supersede-list')
        else if (invalidation === 'repeat') {
          const nextPending = deferred()
          await act(async () => renderer.update(createElement(MountedRequestProbe, {
            baseScope: workspaceScope(),
            requestScope,
            pending: nextPending,
            writes,
          })))
          await click(renderer, 'start')
        } else if (invalidation === 'unmount') {
          await act(async () => renderer.unmount())
        } else {
          const patch = invalidation === 'actorId'
            ? { actorId: 'admin-2' }
            : invalidation === 'tenantId'
              ? { tenantId: 'tenant-2' }
              : { environment: 'SANDBOX' }
          await act(async () => renderer.update(createElement(MountedRequestProbe, {
            baseScope: workspaceScope(patch),
            requestScope,
            pending,
            writes,
          })))
        }

        assert.equal(oldController.signal.aborted, true)
        await settle(pending, outcome)
        assert.deepEqual(
          { success: writes.success, error: writes.error, finally: writes.finally },
          { success: 0, error: 0, finally: 0 },
        )
        if (invalidation !== 'unmount') await act(async () => renderer.unmount())
      }
    }
  }
})
