import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'

const signedCursor = (id = 'txn-2') => Buffer.from(JSON.stringify({
  v: 1,
  s: 'a'.repeat(64),
  i: id,
  m: 'b'.repeat(43),
})).toString('base64url')

const timelineCursor = (id = 'evt-2') => `${Buffer.from(JSON.stringify({
  v: 1,
  t: '2026-07-31T00:00:00.000Z',
  k: 'EVENT',
  i: id,
})).toString('base64url')}.${Buffer.alloc(32, 1).toString('base64url')}`

test('wallet routes keep tenant and environment boundaries immutable', () => {
  const tenantId = 'tenant/acme?environment=PRODUCTION'

  assert.equal(
    adminRoutes.walletOperations(tenantId, 'TEST', { limit: 25, offset: 0 }),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/wallet/operations?environment=TEST&limit=25&offset=0',
  )
  assert.equal(
    adminRoutes.walletTransactions(tenantId, 'UAT'),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/wallet/transactions?environment=UAT&limit=100',
  )
  assert.equal(
    adminRoutes.walletOperation(tenantId, 'op/123?environment=PRODUCTION', 'TEST'),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/wallet/operations/op%2F123%3Fenvironment%3DPRODUCTION?environment=TEST',
  )
})

test('card lifecycle routes encode identifiers and cannot change endpoint shape', () => {
  const tenantId = 'tenant/../../other'
  const cardId = 'card/123?operation=unfreeze'
  const root =
    '/admin/tenants/tenant%2F..%2F..%2Fother/cards/card%2F123%3Foperation%3Dunfreeze'

  assert.equal(adminRoutes.card(tenantId, cardId), root)
  assert.equal(adminRoutes.cardBalance(tenantId, cardId), `${root}/balance`)
  assert.equal(adminRoutes.cardTimeline(tenantId, cardId), `${root}/timeline?limit=25`)
  assert.equal(adminRoutes.cardTimeline(tenantId, cardId, timelineCursor()), `${root}/timeline?limit=25&cursor=${timelineCursor()}`)
  assert.equal(
    adminRoutes.cardTransactions(tenantId, cardId, {
      status: 'SETTLED', type: 'SETTLEMENT', currency: 'USD', from: '2026-07-01', to: '2026-07-31', limit: 25,
    }, signedCursor()),
    `${root}/transactions?status=SETTLED&type=SETTLEMENT&currency=USD&from=2026-07-01&to=2026-07-31&limit=25&cursor=${signedCursor()}`,
  )
  assert.equal(adminRoutes.cardTransaction(tenantId, cardId, 'txn/1?internal=true'), `${root}/transactions/txn%2F1%3Finternal%3Dtrue`)
  assert.equal(adminRoutes.freezeCard(tenantId, cardId), `${root}/freeze`)
  assert.equal(adminRoutes.unfreezeCard(tenantId, cardId), `${root}/unfreeze`)
})

test('Card timeline route fails closed on malformed or non-canonical Backend cursors', () => {
  assert.throws(() => adminRoutes.cardTimeline('tenant-1', 'card-1', 'cursor?other=1'), /cursor is invalid/)
  assert.throws(() => adminRoutes.cardTimeline('tenant-1', 'card-1', 'a'.repeat(2049)), /cursor is invalid/)
  const wrongShape = `${Buffer.from(JSON.stringify({
    v: 1,
    t: '2026-07-31T00:00:00.000Z',
    k: 'EVENT',
    i: 'evt-2',
    extra: true,
  })).toString('base64url')}.${Buffer.alloc(32, 1).toString('base64url')}`
  assert.throws(() => adminRoutes.cardTimeline('tenant-1', 'card-1', wrongShape), /cursor is invalid/)
})

test('Card transaction route emits only Backend-supported filters and caps pages and cursors', () => {
  assert.equal(
    adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 10, provider: 'THREDD' }),
    '/admin/tenants/tenant-1/cards/card-1/transactions?limit=10',
  )
  assert.equal(
    adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 10, type: 'REFUND' }),
    '/admin/tenants/tenant-1/cards/card-1/transactions?type=REFUND&limit=10',
  )
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 26 }), /between 1 and 25/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 25, status: 'PENDING' }), /status is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25, type: 'PURCHASE' }), /type is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 25, status: 'SETTLED', type: 'REFUND' }), /do not match/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25, currency: 'usd' }), /currency is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25, from: '2026-02-30' }), /date is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25 }, 'cursor?other=1'), /cursor is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25 }, 'a'.repeat(513)), /cursor is invalid/)
})

test('ALL is explicit in state but omitted on the wire and signed cursors fail closed', () => {
  assert.equal(
    adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25 }),
    '/admin/tenants/tenant-1/cards/card-1/transactions?limit=25',
  )
  assert.match(
    adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'AUTHORIZED', limit: 25 }, signedCursor()),
    /^\/admin\/tenants\/tenant-1\/cards\/card-1\/transactions\?status=AUTHORIZED&limit=25&cursor=/,
  )
  const wrongShape = Buffer.from(JSON.stringify({ v: 1, s: 'a'.repeat(64), i: 'txn-2', m: 'b'.repeat(43), extra: true })).toString('base64url')
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { status: 'ALL', limit: 25 }, wrongShape), /cursor is invalid/)
})

test('tenant readiness route uses the same encoded tenant boundary', () => {
  assert.equal(
    adminRoutes.readiness('tenant#partner'),
    '/admin/tenants/tenant%23partner/integrations/readiness',
  )
})
