import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'

test('wallet routes keep tenant and environment boundaries immutable', () => {
  const tenantId = 'tenant/acme?environment=PRODUCTION'

  assert.equal(
    adminRoutes.walletOperations(tenantId, 'TEST'),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/wallet/operations?environment=TEST&limit=100',
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
  assert.equal(adminRoutes.cardTimeline(tenantId, cardId), `${root}/timeline`)
  assert.equal(
    adminRoutes.cardTransactions(tenantId, cardId, {
      status: 'SETTLED', currency: 'USD', from: '2026-07-01', to: '2026-07-31', limit: 25,
    }, 'cursor_2'),
    `${root}/transactions?status=SETTLED&currency=USD&from=2026-07-01&to=2026-07-31&limit=25&cursor=cursor_2`,
  )
  assert.equal(adminRoutes.freezeCard(tenantId, cardId), `${root}/freeze`)
  assert.equal(adminRoutes.unfreezeCard(tenantId, cardId), `${root}/unfreeze`)
})

test('Card transaction route emits only Backend-supported filters and caps pages at 25', () => {
  assert.equal(
    adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 10, type: 'PURCHASE', provider: 'THREDD' }),
    '/admin/tenants/tenant-1/cards/card-1/transactions?limit=10',
  )
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 26 }), /between 1 and 25/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 25, status: 'PENDING' }), /status is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 25, currency: 'usd' }), /currency is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 25, from: '2026-02-30' }), /date is invalid/)
  assert.throws(() => adminRoutes.cardTransactions('tenant-1', 'card-1', { limit: 25 }, 'cursor?other=1'), /cursor is invalid/)
})

test('tenant readiness route uses the same encoded tenant boundary', () => {
  assert.equal(
    adminRoutes.readiness('tenant#partner'),
    '/admin/tenants/tenant%23partner/integrations/readiness',
  )
})
