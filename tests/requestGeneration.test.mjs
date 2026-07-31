import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptsResponse,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  syncRequestScope,
} from '../src/requestGeneration.ts'

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
