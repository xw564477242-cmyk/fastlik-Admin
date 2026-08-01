import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptsMountedResponse,
  acceptsResponse,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  syncRequestScope,
} from '../src/requestGeneration.ts'
import { missingWalletOperationDetail } from '../src/walletOperationDetail.ts'

test('only the latest request in one scope may update the page', () => {
  const gate = createRequestGate('tenant-a|TEST|wallet')
  const first = beginRequest(gate, gate.scope)
  const second = beginRequest(gate, gate.scope)

  assert.equal(acceptsResponse(gate, first, gate.scope), false)
  assert.equal(acceptsResponse(gate, second, gate.scope), true)
})

test('tenant, environment or tab scope changes reject old responses', () => {
  for (const nextScope of [
    'tenant-b|TEST|wallet',
    'tenant-a|UAT|wallet',
    'tenant-a|TEST|trace',
  ]) {
    const gate = createRequestGate('tenant-a|TEST|wallet')
    const ticket = beginRequest(gate, gate.scope)
    syncRequestScope(gate, nextScope)

    assert.equal(acceptsResponse(gate, ticket, nextScope), false)
  }
})

test('explicit invalidation rejects in-flight responses', () => {
  const gate = createRequestGate('tenant-a|TEST|user')
  const ticket = beginRequest(gate, gate.scope)
  invalidateRequests(gate)

  assert.equal(acceptsResponse(gate, ticket, gate.scope), false)
})

test('an unmounted workspace rejects an otherwise current late response', () => {
  const gate = createRequestGate('tenant-a|TEST|transactions')
  const ticket = beginRequest(gate, gate.scope)
  assert.equal(acceptsMountedResponse(true, gate, ticket, gate.scope), true)
  assert.equal(acceptsMountedResponse(false, gate, ticket, gate.scope), false)
})

test('an empty operation lookup clears busy and still rejects the in-flight response', () => {
  const gate = createRequestGate('tenant-a|TEST|operation')
  const inFlight = beginRequest(gate, gate.scope)
  let busy = true

  const emptyLookup = beginRequest(gate, gate.scope)
  const reset = missingWalletOperationDetail()
  busy = reset.busy

  assert.equal(busy, false)
  assert.deepEqual(reset.sections, [])
  assert.equal(reset.pageError, '')
  assert.deepEqual(reset.detail, {
    status: 'ERROR',
    message: '请输入真实 Wallet Operation ID',
  })
  assert.equal(acceptsResponse(gate, inFlight, gate.scope), false)
  assert.equal(acceptsResponse(gate, emptyLookup, gate.scope), true)
})
