import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const occurrences = (source, value) => source.split(value).length - 1

test('authenticated Operations route exposes one wallet transaction tab without replacing wallet operations', () => {
  const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')

  assert.equal(occurrences(app, "import { WalletTransactionsWorkspace } from './WalletTransactionsWorkspace'"), 1)
  assert.equal(occurrences(app, '<WalletOperationsWorkspace session={session} tenantId={tenantId} />'), 1)
  assert.equal(occurrences(app, '<WalletTransactionsWorkspace session={session} tenantId={tenantId} onUnauthorized={onUnauthorized} />'), 1)
  assert.match(app, /active === 'operations' && <OperationsWorkspace session=\{session\} tenantId=\{tenantId\} onUnauthorized=\{onLogout\} \/>/)
  assert.match(app, /onClick=\{\(\) => switchTab\('wallet-transactions'\)\}>Wallet Transactions<\/button>/)
  assert.match(app, /const \[tab, setTab\] = useState<[^>]*>\('wallet'\)/)
  assert.match(app, /const lookupTab = tab === 'operation' \|\| tab === 'user' \|\| tab === 'trace'/)
})

test('mounted transaction workspace reuses the supplied session boundary and has no login or route owner', () => {
  const workspace = readFileSync(new URL('../src/WalletTransactionsWorkspace.tsx', import.meta.url), 'utf8')

  assert.match(workspace, /session: AdminSession/)
  assert.match(workspace, /tenantId: string/)
  assert.match(workspace, /onUnauthorized: \(\) => void/)
  assert.match(workspace, /adminWalletTransactionScope\(session, tenantId/)
  assert.match(workspace, /currentToken\.current === session\.accessToken/)
  assert.match(workspace, /onUnauthorized\(\)/)
  assert.doesNotMatch(workspace, /productionApi\.login|window\.history|window\.location|<Router|createBrowserRouter/)
})
