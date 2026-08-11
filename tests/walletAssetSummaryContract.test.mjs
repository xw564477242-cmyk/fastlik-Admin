import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'
import { parseWalletAssetSummaryResponse, walletAssetSummarySessionReadAllowed } from '../src/walletAssetSummaryContract.ts'

const payload = (patch = {}) => ({
  tenantId: 'tenant-1',
  environment: 'SANDBOX',
  customerId: null,
  assets: [
    { assetCode: 'USDT', accountCount: 2, currentBalance: '150', postedBalance: '125', pendingBalance: '25', holdBalance: '25', availableBalance: '125' },
  ],
  ...patch,
})

test('asset summary route encodes scope and rejects unsupported environment or customer filters', () => {
  assert.equal(adminRoutes.walletAssetSummary('tenant/a', 'SANDBOX'), '/admin/tenants/tenant%2Fa/wallet/asset-summary?environment=SANDBOX')
  assert.equal(adminRoutes.walletAssetSummary('tenant/a', 'TEST', 'customer_1'), '/admin/tenants/tenant%2Fa/wallet/asset-summary?environment=TEST&customerId=customer_1')
  assert.throws(() => adminRoutes.walletAssetSummary('tenant', 'PRODUCTION', undefined), /environment is invalid/)
  assert.throws(() => adminRoutes.walletAssetSummary('tenant', 'SANDBOX', 'customer/1'), /customer is invalid/)
})

test('asset summary parser exposes exact per-asset balances in canonical order', () => {
  const result = parseWalletAssetSummaryResponse(JSON.stringify(payload()), { tenantId: 'tenant-1', environment: 'SANDBOX' })
  assert.deepEqual(result, payload())
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.assets), true)
  assert.equal(Object.isFrozen(result.assets[0]), true)
})

test('asset summary parser fails closed on scope mismatch, unknown fields, duplicates and malformed balances', () => {
  assert.throws(() => parseWalletAssetSummaryResponse(JSON.stringify(payload({ tenantId: 'tenant-2' })), { tenantId: 'tenant-1', environment: 'SANDBOX' }), /selected tenant and environment/)
  assert.throws(() => parseWalletAssetSummaryResponse(JSON.stringify({ ...payload(), providerPayload: {} }), { tenantId: 'tenant-1', environment: 'SANDBOX' }), /could not be verified/)
  assert.throws(() => parseWalletAssetSummaryResponse(JSON.stringify(payload({ assets: [...payload().assets, ...payload().assets] })), { tenantId: 'tenant-1', environment: 'SANDBOX' }), /could not be verified/)
  assert.throws(() => parseWalletAssetSummaryResponse(JSON.stringify(payload({ assets: [{ ...payload().assets[0], postedBalance: 'NaN' }] })), { tenantId: 'tenant-1', environment: 'SANDBOX' }), /could not be verified/)
  assert.throws(() => parseWalletAssetSummaryResponse(JSON.stringify(payload({ customerId: 'customer-1' })), { tenantId: 'tenant-1', environment: 'SANDBOX' }), /could not be verified/)
})

test('asset summary session gate binds environment and natural expiry', () => {
  const session = { accessToken: 'token', expiresAt: '2026-08-11T01:00:00.000Z', user: { id: 'admin', email: 'admin@example.invalid', tenantId: 'tenant-1', environment: 'SANDBOX', roles: [], permissions: [] } }
  assert.equal(walletAssetSummarySessionReadAllowed(session, 'SANDBOX', Date.parse('2026-08-11T00:59:59.999Z')), true)
  assert.equal(walletAssetSummarySessionReadAllowed(session, 'TEST', Date.parse('2026-08-11T00:00:00.000Z')), false)
  assert.equal(walletAssetSummarySessionReadAllowed(session, 'SANDBOX', Date.parse(session.expiresAt)), false)
})
