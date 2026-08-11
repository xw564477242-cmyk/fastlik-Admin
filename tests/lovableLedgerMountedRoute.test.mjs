import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Lovable ledger surface is mounted inside Funds with current-scope read-only contracts', () => {
  const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
  const workspace = readFileSync(new URL('../src/LedgerWorkspace.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')

  assert.match(app, /switchTab\('ledger'\)\}>Ledger<\/button>/)
  assert.match(app, /tab === 'ledger' && surface === 'funds' && <LedgerWorkspace/)
  assert.match(workspace, /Promise\.allSettled/)
  assert.match(workspace, /controller\.signal\.aborted \|\| request\.current !== controller \|\| currentScope\.current !== scope \|\| Date\.parse\(session\.expiresAt\) <= now\(\)/)
  assert.match(workspace, /invalidateSession\(token\)[\s\S]+setView\(emptyView\(scope\)\)[\s\S]+return/)
  assert.match(workspace, /environment === 'SANDBOX' \|\| environment === 'TEST'/)
  assert.match(workspace, /不会向 UAT 或 PRODUCTION 请求数据/)
  assert.doesNotMatch(workspace, /method:\s*'POST'|method:\s*'PUT'|MOCK_/)
  assert.match(api, /accounts:[^\n]+signal\?:AbortSignal[^\n]+,'GET',undefined,jsonResponsePolicy,signal/)
  assert.match(api, /journals:[^\n]+signal\?:AbortSignal[^\n]+,'GET',undefined,jsonResponsePolicy,signal/)
  assert.match(api, /trialBalance:[^\n]+signal\?:AbortSignal[^\n]+,'GET',undefined,jsonResponsePolicy,signal/)
})
