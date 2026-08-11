import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('Funds mounts a synthetic read-only FX detail workspace with no quote or conversion write', async () => {
  const [app, workspace, api] = await Promise.all([
    read('../src/AdminApp.tsx'),
    read('../src/FxConversionWorkspace.tsx'),
    read('../src/productionApi.ts'),
  ])
  assert.match(app, /switchTab\('fx-conversion'\)\}>FX Detail<\/button>/)
  assert.match(app, /<FxConversionWorkspace session=\{session\} tenantId=\{tenantId\} invalidateSession=\{invalidateSession\}/)
  assert.match(workspace, /fxConversionSessionReadAllowed/)
  assert.match(workspace, /acceptsMountedResponse/)
  assert.match(workspace, /replaceRequestAbort/)
  assert.doesNotMatch(workspace, /productionApi\.(fxQuote|createFx|convert)/)
  assert.match(api, /walletFxConversion:async[^\n]+,'GET'/)
})
