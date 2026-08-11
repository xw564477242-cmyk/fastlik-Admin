import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('Funds mounts the account-history workspace without exposing a write action', async () => {
  const [app, workspace, api] = await Promise.all([
    read('../src/AdminApp.tsx'),
    read('../src/WalletAccountHistoryWorkspace.tsx'),
    read('../src/productionApi.ts'),
  ])
  assert.match(app, /switchTab\('account-history'\)\}>Account History<\/button>/)
  assert.match(app, /<WalletAccountHistoryWorkspace session=\{session\} tenantId=\{tenantId\} invalidateSession=\{invalidateSession\}/)
  assert.match(workspace, /walletOperationSessionReadAllowed/)
  assert.match(workspace, /AbortController|replaceRequestAbort/)
  assert.match(workspace, /parseAdminWalletOperationPage/)
  assert.doesNotMatch(workspace, /productionApi\.(deposit|withdraw|convert|transfer)/)
  assert.match(api, /walletAccountHistory:[^\n]+,'GET'/)
})

test('account-history scope includes the selected account and all session boundaries', async () => {
  const workspace = await read('../src/WalletAccountHistoryWorkspace.tsx')
  assert.match(workspace, /walletOperationListScope\(session\.user\.id, session\.expiresAt, tenantId, environment, query, session\.user\.tenantId, session\.user\.roles, session\.user\.permissions\)/)
  assert.match(workspace, /baseScope = `\$\{operationScope\}\\u0000\$\{tokenScope\.current\.marker\}\\u0000\$\{accountId\}`/)
  assert.match(workspace, /currentBaseScope\.current === baseScope/)
  assert.match(workspace, /invalidateSession\(token\)/)
})
