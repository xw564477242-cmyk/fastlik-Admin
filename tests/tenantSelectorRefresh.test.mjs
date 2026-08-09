import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')
const panels = readFileSync(new URL('../src/AdminWritePanels.tsx', import.meta.url), 'utf8')

test('new tenant receipt immediately refreshes and selects the top tenant control', () => {
  assert.match(panels, /onCreated\(tenant\)/)
  assert.match(app, /setTenants\(\(current\) => \[tenant, \.\.\.current\.filter\(\(item\) => item\.id !== tenant\.id\)\]\)/)
  assert.match(app, /setTenantId\(tenant\.id\)/)
})
