import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(new URL('../src/AdminWritePanels.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/admin-app.css', import.meta.url), 'utf8')

test('changed template and override values expose an accessible pre-save diff', () => {
  assert.match(panel, /role="dialog" aria-modal="false"/)
  assert.match(panel, /模板参数变更确认/)
  assert.match(panel, /单卡费率变更确认/)
  assert.match(panel, /<th>字段<\/th><th>变更前<\/th><th>变更后<\/th>/)
  assert.match(panel, /const productDiff:/)
  assert.match(panel, /const overrideDiff:/)
  assert.match(styles, /\.change-diff-dialog/)
})

test('diff preview does not replace the existing save actions', () => {
  assert.match(panel, /'更新模板' : '保存模板'/)
  assert.match(panel, />保存单卡费率<\/button>/)
  assert.match(panel, /保存即确认以下变更/)
})
