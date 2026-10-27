import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'

const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const fixed = { nanoid: '3.3.18', 'source-map-js': '1.2.2', vite: '8.1.6' }
function packageFile(name) {
  const file = require.resolve(name + '/package.json')
  assert.ok(fs.realpathSync(file).startsWith(path.join(root, 'node_modules') + path.sep), 'task/CI-local dependency required; no parent fallback')
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, fixed[name], 'never run the regression against an old package')
  return file
}
function bounded(name, source) {
  const file = packageFile(name)
  const code = `const { parentPort } = require('node:worker_threads');const {createRequire}=require('node:module');const req=createRequire(${JSON.stringify(file)});const assert=require('node:assert/strict');${source}`
  return new Promise((resolve, reject) => {
    const worker = new Worker(code, { eval: true, execArgv: [], env: {}, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } })
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate().then(() => error ? reject(error) : resolve(value), reject)
    }
    const timer = setTimeout(() => finish(new Error('PATCH_REGRESSION_TIME_LIMIT_2500MS')), 2500)
    worker.once('message', value => finish(null, value))
    worker.once('error', error => finish(error))
    worker.once('exit', code => { if (!settled) finish(new Error('PATCH_WORKER_EXIT_WITHOUT_RESULT_' + code)) })
  })
}

test('three patched versions and scoped PostCSS pins are exact', () => {
  for (const name of Object.keys(fixed)) packageFile(name)
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
  assert.equal(pkg.devDependencies.vite, fixed.vite)
  assert.deepEqual(pkg.overrides, { 'postcss@8.5.23': { nanoid: fixed.nanoid, 'source-map-js': fixed['source-map-js'] } })
  for (const [name, version] of Object.entries(fixed)) assert.equal(lock.packages['node_modules/' + name].version, version)
})

test('patched nanoid custom zero size terminates, and ordinary six-character IDs remain valid', async () => {
  const value = await bounded('nanoid', `const n=req('nanoid');assert.equal(n.customAlphabet('abc',0)(),'');assert.equal(n.customRandom('abc',0,size=>new Uint8Array(size))(),'');assert.equal(req('nanoid/non-secure').nanoid(6).length,6);parentPort.postMessage('PATCHED_ZERO_AND_NORMAL_PASS');`)
  assert.equal(value, 'PATCHED_ZERO_AND_NORMAL_PASS')
})

test('patched source-map-js preserves an ordinary valid map', async () => {
  const value = await bounded('source-map-js', `const {SourceMapConsumer,SourceNode}=req('source-map-js');const map={version:3,sources:['fixture.css'],names:[],mappings:'AAAA;AACA',sourcesContent:['a\\nb\\n']};const actual=SourceNode.fromStringWithSourceMap('a\\nb\\n',new SourceMapConsumer(map)).toString();assert.equal(actual,'a\\nb\\n');parentPort.postMessage('VALID_MAP_PASS');`)
  assert.equal(value, 'VALID_MAP_PASS')
})

test('patched source-map-js rejects an oversized indexed section offset', async () => {
  const value = await bounded('source-map-js', `const {SourceMapConsumer}=req('source-map-js');const map={version:3,sections:[{offset:{line:2147483647,column:0},map:{version:3,sources:['fixture.css'],names:[],mappings:'AAAA',sourcesContent:['x']}}]};assert.throws(()=>new SourceMapConsumer(map),/Section offset line must not exceed 10000000\\./);parentPort.postMessage('PATCHED_INDEXED_OFFSET_REJECTED');`)
  assert.equal(value, 'PATCHED_INDEXED_OFFSET_REJECTED')
})

test('patched source-map-js bounds a permitted section far beyond generated code', async () => {
  const value = await bounded('source-map-js', `const {SourceMapConsumer,SourceNode}=req('source-map-js');const map={version:3,sections:[{offset:{line:1000000,column:0},map:{version:3,sources:['fixture.css'],names:[],mappings:'AAAA',sourcesContent:['x']}}]};const actual=SourceNode.fromStringWithSourceMap('x\\n',new SourceMapConsumer(map)).toString();assert.equal(actual,'x\\n');parentPort.postMessage('PATCHED_INDEXED_MAP_PASS');`)
  assert.equal(value, 'PATCHED_INDEXED_MAP_PASS')
})

test('Vite 8.1.6 carries the patched editor bundle without starting an editor or server', () => {
  const chunks = path.join(path.dirname(packageFile('vite')), 'dist/node/chunks')
  const source = fs.readdirSync(chunks).filter(n => n.endsWith('.js')).map(n => fs.readFileSync(path.join(chunks, n), 'utf8')).join('\n')
  assert.match(source, /launch-editor@2\.14\.2\//)
  assert.match(source, /launch-editor-middleware@2\.14\.2\//)
  assert.doesNotMatch(source, /launch-editor(?:-middleware)?@2\.14\.1\//)
})
