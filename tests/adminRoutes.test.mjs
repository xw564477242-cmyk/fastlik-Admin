import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'

test('wallet routes keep tenant and environment boundaries immutable', () => {
  const tenantId = 'tenant/acme?environment=PRODUCTION'

  assert.equal(
    adminRoutes.walletOperations(tenantId, 'SANDBOX'),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/wallet/operations?environment=SANDBOX&limit=100',
  )
  assert.equal(
    adminRoutes.walletTransactions(tenantId, 'UAT'),
    '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/wallet/transactions?environment=UAT&limit=100',
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
  assert.equal(adminRoutes.freezeCard(tenantId, cardId), `${root}/freeze`)
  assert.equal(adminRoutes.unfreezeCard(tenantId, cardId), `${root}/unfreeze`)
})

test('tenant readiness route uses the same encoded tenant boundary', () => {
  assert.equal(
    adminRoutes.readiness('tenant#partner'),
    '/admin/tenants/tenant%23partner/integrations/readiness',
  )
})
