import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createInlineAssetModule, serveInlineAsset } from './admin-inline-assets.mjs'

const record = (text, mime) => { const b = Buffer.from(text); return { base64: b.toString('base64'), sha256: createHash('sha256').update(b).digest('hex'), bytes: b.length, mime } }
const records = { '/index.html': record('合成页面', 'text/html; charset=utf-8'), '/assets/app.js': record('export const test = true;', 'application/javascript; charset=utf-8'), '/assets/app.css': record('body{color:#fff}', 'text/css; charset=utf-8') }
const request = (name, options) => new Request('https://preview.invalid' + name, options)

test('unit: all known public responses retain exact bytes and MIME', async () => {
  for (const [url, file] of Object.entries(records)) {
    const response = serveInlineAsset(request(url), records)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), file.mime)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(file.base64, 'base64'))
  }
})
test('unit: root and query preserve the same page; HEAD preserves headers without body', async () => {
  assert.equal(await serveInlineAsset(request('/?view=cardcenter'), records).text(), '合成页面')
  const get = serveInlineAsset(request('/assets/app.css'), records)
  const head = serveInlineAsset(request('/assets/app.css', { method: 'HEAD' }), records)
  assert.deepEqual([...get.headers], [...head.headers]); assert.equal((await head.arrayBuffer()).byteLength, 0)
})
test('unit: conditional cache, unknown paths and writes fail without old asset fallback', () => {
  const etag = serveInlineAsset(request('/'), records).headers.get('etag')
  assert.equal(serveInlineAsset(request('/', { headers: { 'if-none-match': etag } }), records).status, 304)
  for (const uri of ['/missing', '/assets/missing.js', '/runtime-config.js', '/%61ssets/app.js', '/__proto__']) assert.equal(serveInlineAsset(request(uri), records).status, 404)
  assert.equal(serveInlineAsset(request('/', { method: 'POST' }), records).status, 405)
})
test('unit: generator rejects incomplete assets and excludes dynamic runtime config', async () => {
  const root = await fs.mkdtemp(path.join(process.env.INLINE_TEST_ROOT || os.tmpdir(), 'inline-fixture-'))
  await fs.writeFile(path.join(root, 'index.html'), '<script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">')
  await assert.rejects(createInlineAssetModule(root), /COMPLETE_PUBLIC_ASSETS_REQUIRED/)
  await fs.mkdir(path.join(root, 'assets'))
  await fs.writeFile(path.join(root, 'assets/app.js'), 'export const fixture = true;')
  await fs.writeFile(path.join(root, 'assets/app.css'), 'body{color:white}')
  await fs.writeFile(path.join(root, 'runtime-config.js'), 'UNUSED_STATIC_CONFIG')
  const built = await createInlineAssetModule(root)
  assert.equal(Object.keys(built.manifest).length, 3); assert.ok(!built.source.includes('UNUSED_STATIC_CONFIG'))
  const module = await import('data:text/javascript;base64,' + Buffer.from(built.source).toString('base64'))
  assert.equal(await module.fetchInlineAsset(request('/assets/app.css')).text(), 'body{color:white}')
})

const compiled = process.env.INLINE_PACKAGE
test('compiled: every real built resource is byte-identical; HTML/CSS dependencies resolve locally', { skip: !compiled }, async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(compiled, 'ASSET-MANIFEST.json'), 'utf8'))
  const module = await import(pathToFileURL(path.join(compiled, 'modules/admin-inline-public.mjs')))
  for (const [url, entry] of Object.entries(manifest)) {
    const expected = await fs.readFile(path.join(compiled, 'public', url.slice(1)))
    const response = module.fetchInlineAsset(request(url + '?cache=ignored'))
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.deepEqual(bytes, expected); assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    assert.equal(response.headers.get('content-type'), entry.mime)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await module.fetchInlineAsset(request(url, { method: 'HEAD' })).arrayBuffer()).byteLength, 0)
  }
  const html = await fs.readFile(path.join(compiled, 'public/index.html'), 'utf8')
  for (const [, ref] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (ref === '/runtime-config.js') continue
    const url = new URL(ref, 'https://preview.invalid/')
    assert.equal(url.origin, 'https://preview.invalid'); assert.ok(manifest[url.pathname], 'Missing built asset: ' + url.pathname)
  }
  for (const url of Object.keys(manifest).filter(x => x.endsWith('.css'))) {
    const css = await fs.readFile(path.join(compiled, 'public', url.slice(1)), 'utf8')
    for (const [, ref] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (ref.startsWith('data:')) continue
      const resolved = new URL(ref, 'https://preview.invalid' + url)
      assert.equal(resolved.origin, 'https://preview.invalid'); assert.ok(manifest[resolved.pathname])
    }
  }
})
test('compiled: authentication, lease, API, dynamic config and health source remain unchanged', { skip: !compiled }, async () => {
  const original = await fs.readFile('ci/admin-preview-b17/frontend/worker.js', 'utf8')
  const generated = await fs.readFile(path.join(compiled, 'modules/worker.js'), 'utf8')
  assert.equal(generated.replace("import { fetchInlineAsset } from './admin-inline-public.mjs';\n", '').replace('await fetchInlineAsset(request)', 'await env.ASSETS.fetch(request)'), original)
  assert.ok(generated.indexOf("url.pathname === '/runtime-config.js'") < generated.indexOf('await fetchInlineAsset(request)'))
  const worker = (await import(pathToFileURL(path.join(compiled, 'modules/worker.js')))).default
  let network = 0, fallback = 0
  const previous = globalThis.fetch, previousLog = console.log
  globalThis.fetch = async () => { network++; throw Error('NO_NETWORK') }
  console.log = () => {}
  try {
    for (const [url, method] of [['/', 'GET'], ['/api/admin/auth/me', 'GET'], ['/api/admin/auth/login', 'POST']]) {
      const response = await worker.fetch(request(url, { method }), { ASSETS: { fetch() { fallback++; throw Error('NO_OLD_ASSETS') } } })
      assert.equal(response.status, 503); assert.equal(await response.text(), 'Preview unavailable')
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(response.headers.get('x-trace-id'))
    }
  } finally { globalThis.fetch = previous; console.log = previousLog }
  assert.equal(network, 0); assert.equal(fallback, 0)
})
