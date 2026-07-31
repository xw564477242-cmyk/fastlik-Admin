import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_CARD_TIMELINE_ITEMS,
  cardWorkspaceBaseScope,
  cardWorkspaceRequestScope,
  parseCardWorkspaceResponse,
  visibleCardWorkspaceState,
} from '../src/cardWorkspaceContract.ts'
import {
  acceptsResponse,
  beginRequest,
  createRequestGate,
  syncRequestScope,
} from '../src/requestGeneration.ts'

test('scope mismatch hides old Card state on the first render before effects run', () => {
  const oldScope = cardWorkspaceBaseScope('admin-1', 'tenant-a', 'TEST', 'card')
  const nextScope = cardWorkspaceBaseScope('admin-1', 'tenant-b', 'UAT', 'history')
  const oldState = {
    cardId: 'card-private',
    view: { kind: 'CARD', value: { id: 'card-private', last4: '4242' }, empty: false, truncated: false },
    busy: 'read',
    error: 'old-scope error',
  }

  assert.deepEqual(visibleCardWorkspaceState(oldScope, nextScope, oldState), {
    cardId: '', view: null, busy: '', error: '',
  })
  assert.equal(visibleCardWorkspaceState(oldScope, oldScope, oldState), oldState)
})

test('tenant, environment, route, Card ID and action changes reject old Card responses', () => {
  const firstScope = cardWorkspaceRequestScope('admin-1', 'tenant-a', 'TEST', 'card', 'card-a', 'read')
  for (const nextScope of [
    cardWorkspaceRequestScope('admin-1', 'tenant-b', 'TEST', 'card', 'card-a', 'read'),
    cardWorkspaceRequestScope('admin-1', 'tenant-a', 'UAT', 'card', 'card-a', 'read'),
    cardWorkspaceRequestScope('admin-1', 'tenant-a', 'TEST', 'history', 'card-a', 'history'),
    cardWorkspaceRequestScope('admin-1', 'tenant-a', 'TEST', 'card', 'card-b', 'read'),
    cardWorkspaceRequestScope('admin-1', 'tenant-a', 'TEST', 'card', 'card-a', 'balance'),
  ]) {
    const gate = createRequestGate(firstScope)
    const ticket = beginRequest(gate, firstScope)
    syncRequestScope(gate, nextScope)
    assert.equal(acceptsResponse(gate, ticket, nextScope), false)
  }
})

test('a new Admin actor invalidates the prior actor response in the same tenant', () => {
  const oldScope = cardWorkspaceBaseScope('admin-old', 'tenant-a', 'TEST', 'card')
  const nextScope = cardWorkspaceBaseScope('admin-new', 'tenant-a', 'TEST', 'card')
  const gate = createRequestGate(oldScope)
  const ticket = beginRequest(gate, oldScope)
  syncRequestScope(gate, nextScope)
  assert.equal(acceptsResponse(gate, ticket, nextScope), false)
})

test('Card detail exposes only the allowlisted Admin display contract', () => {
  const parsed = parseCardWorkspaceResponse('read', {
    id: 'card-1',
    customerId: 'customer-private',
    environment: 'TEST',
    provider: 'THREDD',
    providerPublicToken: '123456789',
    type: 'VIRTUAL',
    status: 'ACTIVE',
    maskedPan: '************4242',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2030,
    currency: 'USD',
    alias: 'Travel',
    holder: { legalName: 'Private Person', email: 'private@example.test' },
    transitionOperationId: 'operation-private',
    balance: {
      availableBalanceMinor: '1000',
      currentBalanceMinor: '1200',
      pendingAmountMinor: '200',
      currency: 'USD',
      updatedAt: '2026-07-31T00:00:00.000Z',
      providerBalanceReference: 'balance-private',
    },
  }, 'card-1')

  assert.deepEqual(parsed, {
    kind: 'CARD',
    empty: false,
    truncated: false,
    value: {
      id: 'card-1',
      type: 'VIRTUAL',
      status: 'ACTIVE',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2030,
      currency: 'USD',
      alias: 'Travel',
      balance: {
        availableBalanceMinor: '1000',
        currentBalanceMinor: '1200',
        pendingAmountMinor: '200',
        currency: 'USD',
        updatedAt: '2026-07-31T00:00:00.000Z',
      },
    },
  })
})

test('Card balance omits Provider and internal fields', () => {
  const parsed = parseCardWorkspaceResponse('balance', {
    cardId: 'card-1',
    availableBalanceMinor: '1000',
    currentBalanceMinor: '1200',
    pendingAmountMinor: '200',
    currency: 'USD',
    updatedAt: '2026-07-31T00:00:00.000Z',
    provider: 'THREDD',
    providerPublicToken: '123456789',
  }, 'card-1')
  assert.deepEqual(Object.keys(parsed.value).sort(), [
    'availableBalanceMinor',
    'currency',
    'currentBalanceMinor',
    'pendingAmountMinor',
    'updatedAt',
  ])
})

test('Card timeline is empty-safe, bounded and strips payload, actor and operation data', () => {
  assert.deepEqual(parseCardWorkspaceResponse('history', [], 'card-1'), {
    kind: 'TIMELINE', value: [], empty: true, truncated: false,
  })

  const raw = Array.from({ length: MAX_CARD_TIMELINE_ITEMS + 5 }, (_, index) => ({
    cardId: 'card-1',
    kind: index % 2 ? 'EVENT' : 'LIFECYCLE',
    action: 'FREEZE_CARD',
    fromStatus: 'ACTIVE',
    toStatus: 'FROZEN',
    createdAt: `2026-07-31T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    actorId: 'admin-private',
    operationId: 'operation-private',
    idempotencyKey: 'key-private',
    payload: { provider: 'THREDD', providerPublicToken: '123456789' },
  }))
  const parsed = parseCardWorkspaceResponse('history', raw, 'card-1')
  assert.equal(parsed.empty, false)
  assert.equal(parsed.truncated, true)
  assert.equal(Array.isArray(parsed.value) && parsed.value.length, MAX_CARD_TIMELINE_ITEMS)
  assert.equal(JSON.stringify(parsed.value).includes('private'), false)
  assert.equal(JSON.stringify(parsed.value).includes('THREDD'), false)
})

test('mismatched Card identities are rejected before rendering', () => {
  assert.throws(
    () => parseCardWorkspaceResponse('read', { id: 'card-other', status: 'ACTIVE' }, 'card-1'),
    /does not match the requested Card ID/,
  )
  assert.throws(
    () => parseCardWorkspaceResponse('history', [{ cardId: 'card-other', kind: 'EVENT' }], 'card-1'),
    /does not match the requested Card ID/,
  )
})
