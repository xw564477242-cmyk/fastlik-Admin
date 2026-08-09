import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(new URL('../src/AdminWritePanels.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/admin-app.css', import.meta.url), 'utf8')

test('product and card override fields use the authenticated tenant cap contract', () => {
  assert.match(api, /caps:Required<CardFeeValues>/)
  assert.match(panel, /setFeeCaps\(policy\.caps\)/)
  assert.match(panel, /aria-invalid=\{overCap \? 'true' : undefined\}/)
  assert.match(panel, /超过租户上限 \{cap\}/)
  assert.match(styles, /\.rate-field-invalid/)
})

test('the same cap-aware fee input renderer is mounted for product and override forms', () => {
  assert.equal((panel.match(/\{feeInputs\(/g) ?? []).length, 2)
})
