import test from 'node:test'
import assert from 'node:assert/strict'
import {guard,verifyPayload,safeSettings,release,target,Stop} from './admin-revenue-read-ci.mjs'
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:target.repository,GITHUB_REF:target.ref,
  GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),
  SEALED_COMMIT:'a'.repeat(40),GITHUB_WORKFLOW_REF:target.repository+'/.github/workflows/ci.yml@'+target.ref,
  HOSTED_ACCOUNT_ID:target.account,CLOUDFLARE_API_TOKEN:'offline-fixture-not-a-real-credential'})
const next='11111111-2222-4333-8444-555555555555'
const before='ed8d2086-2222-4333-8444-555555555555'
const snapshot=()=>({version:before,createdOn:'2026-10-29T00:00:00Z',settings:{lease:{until:'unchanged'},bindings:[{name:'ASSETS',type:'assets'}]},domain:{enabled:true,previewsEnabled:false}})
const deps=extra=>({skipSelfHash:true,verifyPayload:async()=>({manifestSHA256:target.manifestSHA256}),metadata:async()=>snapshot(),...extra})
test('sealed dispatch context refuses another commit/workflow/ref/retry before metadata or publish',async()=>{
  for(const patch of [{SEALED_COMMIT:'b'.repeat(40)},{GITHUB_REF:'refs/heads/main'},
    {GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'push'},{GITHUB_WORKFLOW_REF:'other/workflow'}]){
    let calls=0
    const r=await release({...env(),...patch},deps({metadata:async()=>{calls++},publish:async()=>{calls++}}))
    assert.equal(r.reason,'SEALED_CONTEXT_REFUSED');assert.equal(calls,0)
  }
})
test('existing hosted account mismatch has zero network or publish',async()=>{
  let calls=0;const r=await release({...env(),HOSTED_ACCOUNT_ID:'other-account'},deps({metadata:async()=>{calls++}}))
  assert.equal(r.reason,'HOSTED_ACCOUNT_MISMATCH');assert.equal(calls,0);assert(!JSON.stringify(r).includes('other-account'))
})
test('sealed real input manifest, exact five modules and three embedded public witnesses validate offline',async()=>{
  const value=await verifyPayload()
  assert.equal(value.modules.length,5);assert.equal(value.publicDelta.length,3)
  assert(value.modules.every(f=>!f.path.includes('runtime-config')))
})
test('payload mismatch stops before metadata or publish',async()=>{
  let calls=0;const r=await release(env(),deps({verifyPayload:async()=>{throw new Stop('PAYLOAD_SHA_MISMATCH')},metadata:async()=>{calls++}}))
  assert.equal(r.reason,'PAYLOAD_SHA_MISMATCH');assert.equal(calls,0)
})
test('safe settings never access secret or unknown plain-text binding values',()=>{
  const forbidden=()=>{throw new Error('must not access credential value')}
  const secret={name:'SECRET_TEST',type:'secret_text',get text(){return forbidden()}}
  const unknown={name:'PRIVATE_SETTING',type:'plain_text',get text(){return forbidden()}}
  const safe=safeSettings({bindings:[secret,unknown,{name:'ASSETS',type:'assets'},
    {name:'FASTLINK_PREVIEW_DEPLOYMENT_PROFILE',type:'plain_text',text:'B17_READONLY_MONTH_V1'},
    ...['B17_RETENTION_UNTIL_UTC','B17_WINDOW_OPEN_UTC','B17_WINDOW_CLOSE_UTC',
      'B17_QUALIFY_UNTIL_UTC','B17_PAID_START_UTC','B17_PAID_STOP_UTC'].map(name=>
        ({name,type:'plain_text',text:'2026-11-23T12:34:22.235Z'})),
    {name:'B17_WINDOW_PHASE',type:'plain_text',text:'OPEN'}]})
  assert.deepEqual(safe.bindings.find(x=>x.name==='SECRET_TEST'),{name:'SECRET_TEST',type:'secret_text'})
  assert(!JSON.stringify(safe).includes('PRIVATE_SETTING":'))
  assert.equal(Object.keys(safe.lease).length,8)
  assert.equal(safe.lease.B17_WINDOW_PHASE,'OPEN')
  assert.equal(safe.lease.B17_WINDOW_CLOSE_UTC,'2026-11-23T12:34:22.235Z')
})
test('current active version is acquired fully and drift blocks publish',async()=>{
  let n=0;const r=await release(env(),deps({metadata:async()=>({...snapshot(),version:next}),publish:async()=>{n++}}))
  assert.equal(r.reason,'ACTIVE_BASELINE_DRIFT');assert.equal(n,0)
})
test('one publish, observed metadata equality and distinct identities succeed',async()=>{
  let reads=0,writes=0
  const r=await release(env(),deps({metadata:async()=>({...snapshot(),version:reads++===0?before:next}),
    publish:async()=>{writes++;return {version:next,exitCode:0}}}))
  assert.equal(writes,1);assert.equal(reads,2);assert.equal(r.status,'PUBLISHED_METADATA_CONFIRMED')
  assert.equal(r.before.version,before);assert.equal(r.after.version,next)
  assert.notEqual(r.transportCommit,r.sourceSnapshot);assert.equal(r.metadataComparison,'EQUAL')
  assert(!JSON.stringify(r).includes(env().CLOUDFLARE_API_TOKEN))
  assert(!Object.hasOwn(r,'varsSecretsLeaseChanged'))
})
test('post-publish metadata drift fails and only reads independently, never replays',async()=>{
  let reads=0,writes=0
  const r=await release(env(),deps({metadata:async()=>{reads++;return reads===1?snapshot():{...snapshot(),version:next,settings:{changed:true}}},
    publish:async()=>{writes++;return {version:next,exitCode:0}}}))
  assert.equal(writes,1);assert.equal(reads,3);assert.equal(r.reason,'NON_SECRET_METADATA_DRIFT')
  assert.equal(r.publishMayHaveStarted,true)
})
test('uncertain CLI exit preserves exit/code and one independent read, zero replay/rollback',async()=>{
  let reads=0,writes=0
  const r=await release(env(),deps({metadata:async()=>{reads++;return snapshot()},
    publish:async()=>{writes++;throw new Stop('WRANGLER_PUBLISH_UNCONFIRMED',{exitCode:1,platformCodes:[10000]})}}))
  assert.equal(writes,1);assert.equal(reads,2);assert.equal(r.details.exitCode,1)
  assert.deepEqual(r.details.platformCodes,[10000]);assert.equal(r.automaticRetry,false);assert.equal(r.automaticRollback,false)
})

