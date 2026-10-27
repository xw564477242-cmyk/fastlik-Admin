import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const decodedAssets = new Map()
// Runs only after the unchanged Worker Access/window/API/config/health branches.
export function serveInlineAsset(request, records) {
  const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('allow', 'GET, HEAD')
    return new Response(null, { status: 405, headers })
  }
  const pathname = new URL(request.url).pathname
  const key = pathname === '/' ? '/index.html' : pathname
  const record = /[%\\]/.test(pathname) ? undefined : records[key]
  if (!record || !Object.hasOwn(records, key)) return new Response(null, { status: 404, headers })
  headers.set('content-type', record.mime)
  headers.set('etag', '"' + record.sha256 + '"')
  if (request.headers.get('if-none-match') === headers.get('etag')) return new Response(null, { status: 304, headers })
  headers.set('content-length', String(record.bytes))
  let body = null
  if (request.method !== 'HEAD') {
    if (!decodedAssets.has(record.sha256)) {
      const decoded = typeof Uint8Array.fromBase64 === 'function'
        ? Uint8Array.fromBase64(record.base64)
        : Uint8Array.from(atob(record.base64), c => c.charCodeAt(0))
      decodedAssets.set(record.sha256, decoded)
    }
    body = decodedAssets.get(record.sha256)
  }
  return new Response(body, { status: 200, headers })
}

export async function createInlineAssetModule(directory) {
  const records = Object.create(null)
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
  async function walk(relative = '') {
    for (const entry of (await fs.readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.posix.join(relative, entry.name)
      if (entry.isSymbolicLink() || !/^[A-Za-z0-9_./-]+$/.test(name)) throw Error('PUBLIC_ASSET_PATH_REFUSED')
      if (entry.isDirectory()) { await walk(name); continue }
      if (!entry.isFile()) throw Error('PUBLIC_ASSET_TYPE_REFUSED')
      // The Worker already serves this dynamically from its authorized binding.
      if (name === 'runtime-config.js') continue
      const mime = types[path.extname(name)]
      if (!mime) throw Error('PUBLIC_ASSET_MIME_REFUSED')
      const bytes = await fs.readFile(path.join(directory, name))
      records['/' + name] = { mime, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, base64: bytes.toString('base64') }
    }
  }
  await walk()
  if (!records['/index.html'] || !Object.keys(records).some(x => x.endsWith('.js')) || !Object.keys(records).some(x => x.endsWith('.css'))) throw Error('COMPLETE_PUBLIC_ASSETS_REQUIRED')
  const manifest = Object.fromEntries(Object.entries(records).map(([key, { base64, ...metadata }]) => [key, metadata]))
  const source = 'const decodedAssets = new Map();\nconst records = Object.freeze(' + JSON.stringify(records) + ');\n' + serveInlineAsset.toString() + '\nexport const inlineAssetManifest = Object.freeze(' + JSON.stringify(manifest) + ');\nexport const fetchInlineAsset = request => serveInlineAsset(request, records);\n'
  if (Buffer.byteLength(source) > 2 * 1024 * 1024) throw Error('INLINE_MODULE_SIZE_REFUSED')
  return { source, manifest }
}
