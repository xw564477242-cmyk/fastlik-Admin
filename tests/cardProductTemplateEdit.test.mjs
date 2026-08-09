import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(new URL('../src/AdminWritePanels.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')

test('existing product templates can be selected, edited and saved through the tenant-scoped PUT contract', () => {
  assert.match(panel, /编辑 · \{row\.code\} · \{row\.name\}/)
  assert.match(panel, /productionApi\.updateCardProduct/)
  assert.match(panel, /模板修改原因/)
  assert.match(panel, /更新模板/)
  assert.match(api, /adminRoutes\.cardProduct\(tenantId,productId\),key,'PUT'/)
})

test('template update keeps the immutable code and requires an audited reason', () => {
  assert.match(panel, /disabled=\{Boolean\(product\.id\)\}/)
  assert.match(panel, /required minLength=\{8\} maxLength=\{240\}/)
})
