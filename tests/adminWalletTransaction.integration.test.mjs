import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminWalletTransactionScope,
  loadAdminWalletTransactions,
} from '../src/adminWalletTransactionContract.ts'

const environment = process.env.FASTLINK_TEST_ENVIRONMENT
const supported = environment === 'SANDBOX' || environment === 'TEST'

test(`Admin Wallet transaction exact Mock consumer (${environment ?? 'ENVIRONMENT_REQUIRED'})`, { skip: !supported }, async () => {
  const session = {
    accessToken: 'integration-admin-wallet-transaction-token',
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'admin-integration-01',
      email: 'integration@example.test',
      tenantId: 'tenant-integration',
      environment,
      roles: ['WALLET_VIEWER'],
      permissions: ['admin:read'],
    },
  }
  const query = { type: 'TRANSFER', status: 'COMPLETED', assetCode: 'USD', limit: 25, offset: 0 }
  const scope = adminWalletTransactionScope(session, 'tenant-integration', query)
  let requests = 0
  const result = await loadAdminWalletTransactions(async ({ path, method, token, signal }) => {
    requests += 1
    assert.equal(method, 'GET')
    assert.equal(token, session.accessToken)
    assert.equal(signal?.aborted, false)
    assert.equal(path, `/admin/tenants/tenant-integration/wallet/transactions?environment=${environment}&type=TRANSFER&status=COMPLETED&assetCode=USD&limit=25&offset=0`)
    return JSON.stringify({
      items: [{
        id: 'transaction-integration', tenantId: 'tenant-integration', environment,
        walletAccountId: 'wallet-integration', type: 'TRANSFER', status: 'COMPLETED',
        assetCode: 'USD', amount: '25.5', referenceType: 'WalletOperation',
        referenceId: 'operation-integration', idempotencyKey: 'idempotency-integration',
        journalIds: ['journal-integration'], createdAt: '2026-08-02T10:00:00.000Z',
        updatedAt: '2026-08-02T10:00:00.000Z',
      }],
      pagination: { total: 1, limit: 25, offset: 0, hasMore: false },
    })
  }, session, 'tenant-integration', query, null, new AbortController().signal)
  assert.equal(requests, 1)
  assert.equal(result.scope, scope)
  assert.equal(result.snapshot?.page.items.length, 1)
  assert.equal(result.exitSession, false)
})
