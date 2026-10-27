import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createInlineAssetModule } from './admin-inline-assets.mjs'

// Offline packaging only. No cloud API, credentials, environment files or publish.
const args = process.argv.slice(2)
if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--out') throw Error('EXPLICIT_SOURCE_AND_NEW_OUTPUT_REQUIRED')
const control = process.cwd(), root = path.resolve(args[1]), out = path.resolve(args[3])
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: control, encoding: 'utf8' }).trim()
if (!/^[0-9a-f]{40}$/.test(head)) throw Error('SOURCE_HEAD_REQUIRED')
const manifestText = await fs.readFile(path.join(control, 'ci/admin-preview-b17/APPROVED-SOURCE-SHA256SUMS'), 'utf8')
const lines = manifestText.trim().split('\n')
if (lines.length !== 16) throw Error('SOURCE_SCOPE_MISMATCH')
for (const line of lines) {
  const match = /^([0-9a-f]{64})  (src\/[A-Za-z0-9_./-]+)$/.exec(line)
  if (!match || match[2].includes('..')) throw Error('SOURCE_PATH_REFUSED')
  for (const base of [root, control]) if (createHash('sha256').update(await fs.readFile(path.join(base, match[2]))).digest('hex') !== match[1]) throw Error('SOURCE_SHA_MISMATCH')
}
const snapshot = createHash('sha256').update(manifestText).digest('hex')
for (const [name, version] of [['vite', '8.1.6'], ['@vitejs/plugin-react', '6.0.4']]) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'))
  if (pkg.version !== version) throw Error('LOCKED_BUILD_TOOL_MISMATCH')
}
await fs.mkdir(out, { mode: 0o700 })
const { build } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')))
const { default: react } = await import(pathToFileURL(path.join(root, 'node_modules/@vitejs/plugin-react/dist/index.js')))
const publicDir = path.join(out, 'public')
await build({ root, configFile: false, envDir: false, cacheDir: path.join(out, 'cache'), publicDir: false, base: '/', plugins: [react()], define: {
  'import.meta.env.VITE_FASTLINK_API_URL': JSON.stringify('/api'),
  'import.meta.env.VITE_FASTLINK_ENVIRONMENT': JSON.stringify('TEST'),
  'import.meta.env.VITE_FASTLINK_BUILD_SHA': JSON.stringify(head),
  'import.meta.env.VITE_FASTLINK_SOURCE_SNAPSHOT': JSON.stringify(snapshot),
  'import.meta.env.VITE_FASTLINK_CANDIDATE_ID': JSON.stringify('FL-LAUNCH-B17-20261026-full-admin'),
  'import.meta.env.VITE_FASTLINK_PREVIEW_MODE': JSON.stringify('READ_ONLY')
}, build: { outDir: publicDir, emptyOutDir: false, sourcemap: false, manifest: false } })
const inline = await createInlineAssetModule(publicDir)
const pkg = path.join(out, 'modules')
await fs.mkdir(pkg, { mode: 0o700 })
const before = await fs.readFile(path.join(control, 'ci/admin-preview-b17/frontend/worker.js'), 'utf8')
const branch = 'await env.ASSETS.fetch(request)'
if (before.split(branch).length !== 2) throw Error('UNIQUE_STATIC_BRANCH_REQUIRED')
const after = "import { fetchInlineAsset } from './admin-inline-public.mjs';\n" + before.replace(branch, 'await fetchInlineAsset(request)')
if (after.replace("import { fetchInlineAsset } from './admin-inline-public.mjs';\n", '').replace('await fetchInlineAsset(request)', branch) !== before) throw Error('SECURITY_BRANCH_DRIFT')
await fs.writeFile(path.join(pkg, 'worker.js'), after)
await fs.writeFile(path.join(pkg, 'admin-inline-public.mjs'), inline.source)
for (const name of ['safe-preview-diagnostics.mjs', 'admin-restored-read-routing.mjs']) await fs.copyFile(path.join(control, 'ci/admin-preview-b17/frontend', name), path.join(pkg, name))
await fs.writeFile(path.join(pkg, 'admin-release-identity.mjs'), 'export const adminReleaseIdentity = Object.freeze(' + JSON.stringify({ buildSha: head, snapshot, candidate: 'FL-LAUNCH-B17-20261026-full-admin' }) + ');\n')
await fs.writeFile(path.join(out, 'ASSET-MANIFEST.json'), JSON.stringify(inline.manifest, null, 2) + '\n')
const moduleNames = (await fs.readdir(pkg)).sort()
if (moduleNames.length !== 5) throw Error('COMPLETE_MODULE_PACKAGE_REQUIRED')
const hashes = []
for (const name of moduleNames) hashes.push(createHash('sha256').update(await fs.readFile(path.join(pkg, name))).digest('hex') + '  modules/' + name)
await fs.writeFile(path.join(out, 'SHA256SUMS'), hashes.join('\n') + '\n')
await fs.writeFile(path.join(out, 'BUILD-RESULT.json'), JSON.stringify({ status: 'OFFLINE_COMPLETE_MODULE_PACKAGE', sourceHead: head, sourceSnapshot: snapshot, publicFiles: Object.keys(inline.manifest).length, modules: moduleNames, staticFallback: false, authApiWindowConfigUnchanged: true, cloudOperations: 0 }, null, 2) + '\n')
console.log(JSON.stringify({ status: 'OFFLINE_COMPLETE_MODULE_PACKAGE', sourceHead: head, publicFiles: Object.keys(inline.manifest).length, modules: moduleNames }))
