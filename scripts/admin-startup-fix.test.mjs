import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {mountGeneratedEntry} from './admin-startup-dom-fixture.mjs'
import {publicDefines} from './build-admin-startup-fix.mjs'
const proofRoot=process.env.STARTUP_PROOF_ROOT||'ci/admin-startup-proof'
const publicRoot=process.env.STARTUP_PUBLIC_ROOT||'ci/admin-revenue-read-b17-startup-fix/public-delta'
const proof=JSON.parse(await readFile(path.join(proofRoot,'BUILD-RESULT.json'),'utf8'))
const input=proof.publicInput
const runtime={environment:'TEST',apiUrl:'/api',buildSha:input.VITE_FASTLINK_BUILD_SHA}
const sha=value=>createHash('sha256').update(value).digest('hex')
async function config(file='config-probe.mjs',value=runtime){
 const context=vm.createContext({window:{__FASTLINK_RUNTIME__:value}})
 const code=await readFile(path.join(proofRoot,file),'utf8')
 assert.equal(sha(code),proof.configurationProbes[file])
 const module=new vm.SourceTextModule(code,{context})
 await module.link(()=>{throw Error('unexpected configuration import')});await module.evaluate()
 return module.namespace.runtimeConfig
}
test('actual Vite-generated configuration initializes TEST /api READ_ONLY and bound public identity',async()=>{
 const c=await config()
 assert.equal(c.environment,'TEST');assert.equal(c.apiUrl,'/api');assert.equal(c.previewReadOnly,true)
 assert.equal(c.buildSha,input.VITE_FASTLINK_BUILD_SHA)
 assert.equal(c.buildIdentity.source,'BUILD_TIME');assert.equal(c.buildIdentity.candidateId,input.VITE_FASTLINK_CANDIDATE_ID)
 assert.equal(c.buildIdentity.sourceSnapshot,input.VITE_FASTLINK_SOURCE_SNAPSHOT)
 assert.equal(c.buildIdentity.status,'PREVIEW_SOURCE_SNAPSHOT_BOUND_NOT_DEPLOYED')
 assert.equal(c.buildIdentity.deployment,'NOT_DEPLOYED')
})
test('generated missing-build-input probes still throw before runtime fallback',async()=>{
 await assert.rejects(config('negative-probes/missing-environment.mjs'),/Missing required build variable: VITE_FASTLINK_ENVIRONMENT/)
 await assert.rejects(config('negative-probes/missing-api.mjs'),/Missing required build variable: VITE_FASTLINK_API_URL/)
})
test('existing environment enumeration, same-origin and identity-conflict guards are unchanged',async()=>{
 await assert.rejects(config('config-probe.mjs',{...runtime,environment:'INVALID'}),/must be LOCAL, SANDBOX, TEST, UAT, or PRODUCTION/)
 await assert.rejects(config('config-probe.mjs',{...runtime,apiUrl:'https://unapproved.invalid/api'}),/must use same-origin/)
 await assert.rejects(config('config-probe.mjs',{...runtime,buildSha:'a'.repeat(40)}),/Conflicting build-time and runtime source commits/)
})
test('actual generated entry mounts login form through ReactDOM in isolated DOM with no live network',async()=>{
 const name=Object.keys(proof.publicAssets).find(p=>p.endsWith('.js'))
 const code=await readFile(path.join(publicRoot,name.slice(1)),'utf8')
 assert.equal(sha(code),proof.publicAssets[name].sha256)
 const result=await mountGeneratedEntry(code,runtime)
 assert(result.mountedChildren>0)
 assert(result.nodes.some(n=>n.tag==='FORM'&&n.attributes.class==='login-card'))
 assert.equal(result.nodes.filter(n=>n.tag==='INPUT').length,3)
 assert(result.nodes.some(n=>n.tag==='INPUT'&&n.type==='email'))
 assert(result.nodes.some(n=>n.tag==='INPUT'&&n.type==='password'))
 assert(result.nodes.some(n=>n.tag==='BUTTON'))
 assert.match(result.text,/管理员登录/);assert.match(result.text,/TEST · \/api/)
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.requests,[])
})
test('build entry accepts only the six public approved values, never extra process environment',()=>{
 assert.equal(Object.keys(publicDefines(input)).length,6)
 for(const patch of [{PRIVATE_CREDENTIAL:'not-real'},{VITE_FASTLINK_ENVIRONMENT:'PRODUCTION'},
  {VITE_FASTLINK_API_URL:'https://unapproved.invalid/api'},{VITE_FASTLINK_PREVIEW_MODE:'WRITE'}]){
  assert.throws(()=>publicDefines({...input,...patch}),/EXACT_PUBLIC_BUILD_INPUT_REQUIRED/)
 }
})
