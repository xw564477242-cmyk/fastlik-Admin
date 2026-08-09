import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8')

test('card programs route mounts the real SANDBOX configuration contract', () => {
  assert.match(source, /active === 'programs' && <CardConfigurationPanel/)
  assert.doesNotMatch(source, /programs:\s*\{\s*title: 'Unavailable · Backend Contract Missing'/)
})
