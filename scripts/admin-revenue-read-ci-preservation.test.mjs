import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {preservedRuntimeConfig,release,target} from './admin-revenue-read-ci.mjs'
const base=JSON.parse(await readFile('ci/admin-revenue-read-b17/wrangler.json','utf8'))
test('existing enabled observability and representable limits/placement are inherited exactly, never defaulted off',()=>{
  const settings={observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,invocation_logs:true,persist:true},traces:{enabled:false}},limits:{cpu_ms:30000},placement:{mode:'smart',hint:'example-region'}}
  const prior=JSON.stringify(base)
  const result=preservedRuntimeConfig(base,settings)
  for(const name of ['observability','limits','placement'])assert.deepEqual(result[name],settings[name])
  assert.equal(JSON.stringify(base),prior)
  assert.equal(result.unsafe.metadata.keep_assets,true)
  assert.deepEqual(result.unsafe.metadata.keep_bindings,base.unsafe.metadata.keep_bindings)
})
test('disabled observability remains the exact observed object; null limits/placement introduce no defaults',()=>{
  const result=preservedRuntimeConfig(base,{observability:{enabled:false},limits:null,placement:null})
  assert.deepEqual(result.observability,{enabled:false})
  assert(!Object.hasOwn(result,'limits'));assert(!Object.hasOwn(result,'placement'))
})
test('absent/unsupported observability and unsupported resource metadata are rejected before cloud write',()=>{
  for(const settings of [{observability:null},{observability:{enabled:true,unknown:true}},
    {observability:{enabled:true},limits:{unsupported_limit:1}},
    {observability:{enabled:true},placement:{mode:'targeted',region:'unknown'}}]){
    assert.throws(()=>preservedRuntimeConfig(base,settings),e=>e.code.endsWith('PRESERVATION_UNCONFIRMED'))
  }
})
test('release stops in preservation phase with no CLI invocation or second metadata request when inheritance is unproven',async()=>{
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:target.repository,GITHUB_REF:target.ref,
    GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),
    SEALED_COMMIT:'a'.repeat(40),GITHUB_WORKFLOW_REF:target.repository+'/.github/workflows/ci.yml@'+target.ref,
    HOSTED_ACCOUNT_ID:target.account,CLOUDFLARE_API_TOKEN:'offline-fixture-not-a-credential'}
  let reads=0,publishes=0
  const result=await release(env,{skipSelfHash:true,verifyPayload:async()=>({}),
    metadata:async()=>{reads++;return {version:'ed8d2086-2222-4333-8444-555555555555',settings:{observability:null}}},
    readBaseConfig:async()=>base,publish:async()=>{publishes++}})
  assert.equal(result.phase,'METADATA_PRESERVATION');assert.equal(result.reason,'OBSERVABILITY_PRESERVATION_UNCONFIRMED')
  assert.equal(reads,1);assert.equal(publishes,0);assert.equal(result.publishMayHaveStarted,false)
})

