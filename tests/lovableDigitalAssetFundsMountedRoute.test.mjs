import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Lovable Funds mounts the verified read-only Digital Asset asset summary', () => {
  const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const workspace = readFileSync(new URL('../src/DigitalAssetFundsWorkspace.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')

  assert.match(app, /switchTab\('digital-assets'\)\}>Digital Assets<\/button>/)
  assert.match(app, /tab === 'digital-assets' && surface === 'funds' && <DigitalAssetFundsWorkspace/)
  assert.match(workspace, /walletAssetSummarySessionReadAllowed/)
  assert.match(workspace, /controller\.signal\.aborted \|\| request\.current !== controller \|\| currentScope\.current !== scope/)
  assert.match(workspace, /不会向 UAT 或 PRODUCTION 请求数据/)
  assert.match(workspace, /不会读取本地缓存或 Lovable Mock/)
  assert.doesNotMatch(workspace, /method:\s*'POST'|method:\s*'PUT'|MOCK_/)
  assert.match(api, /walletAssetSummary:[^\n]+,'GET',undefined,\{format:'bounded-text'/)
})
