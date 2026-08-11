import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Lovable funds surface mounts only verified wallet, digital asset, treasury and ledger workspaces', () => {
  const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')

  assert.match(app, /active === 'funds' && <OperationsWorkspace[^>]+surface="funds"/)
  assert.match(app, /data-admin-surface=\{surface\}/)
  assert.match(app, /surface === 'funds' \? <>[\s\S]+tab === 'digital-assets'/)
  assert.match(app, /onClick=\{\(\) => switchTab\('treasury'\)\}>Treasury & Reconciliation<\/button>/)
  assert.match(app, /onClick=\{\(\) => switchTab\('digital-assets'\)\}>Digital Assets<\/button>/)
  assert.match(app, /tab === 'wallet' && <WalletOperationsWorkspace session=\{session\} tenantId=\{tenantId\} \/>/)
  assert.match(app, /tab === 'wallet-transactions' && <WalletTransactionsWorkspace session=\{session\} tenantId=\{tenantId\} onUnauthorized=\{onUnauthorized\} \/>/)
  assert.match(app, /tab === 'treasury' && surface === 'funds' && <TreasuryReconciliationWorkspace/)
  assert.match(app, /tab === 'digital-assets' && surface === 'funds' && <DigitalAssetFundsWorkspace/)
  assert.doesNotMatch(app, /active === 'funds' && <TreasuryReconciliationWorkspace/)
})
