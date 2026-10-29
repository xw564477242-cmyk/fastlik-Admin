import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {releaseNative,multipart,versionMetadata} from './admin-native-version-ci.mjs'
import {verifyPayload,target} from './admin-revenue-read-ci.mjs'
import {activeVersion,projectVersion} from './admin-readonly-metadata-ci.mjs'
const next='11111111-2222-4333-8444-555555555555'
const deploymentId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const sha=b=>createHash('sha256').update(b).digest('hex')
const names=['worker.js','admin-inline-public.mjs','admin-release-identity.mjs','admin-restored-read-routing.mjs','safe-preview-diagnostics.mjs']
const bytes=new Map(names.map(name=>['frontend/'+name,Buffer.from('sealed synthetic module '+name)]))
const payload={modules:[...bytes].map(([path,value])=>({path,bytes:value.length,sha256:sha(value)}))}
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:target.repository,GITHUB_REF:target.ref,
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'b'.repeat(40),
 SEALED_COMMIT:'b'.repeat(40),GITHUB_WORKFLOW_REF:target.repository+'/.github/workflows/ci.yml@'+target.ref,
 HOSTED_ACCOUNT_ID:target.account,CLOUDFLARE_API_TOKEN:'offline-not-a-live-secret',NATIVE_VERSION_PUBLISH:'true'})
const lease=[{name:'FASTLINK_PREVIEW_DEPLOYMENT_PROFILE',type:'plain_text',text:'B17_READONLY_MONTH_V1'},
 {name:'B17_WINDOW_PHASE',type:'plain_text',text:'OPEN'},
 ...['B17_RETENTION_UNTIL_UTC','B17_WINDOW_OPEN_UTC','B17_WINDOW_CLOSE_UTC','B17_QUALIFY_UNTIL_UTC',
 'B17_PAID_START_UTC','B17_PAID_STOP_UTC'].map(name=>({name,type:'plain_text',text:'2026-11-23T12:34:22.235Z'}))]
const bindings=()=>[{name:'ASSETS',type:'assets'},
 {name:'SECRET_ONLY_NAME',type:'secret_text',get text(){throw Error('secret read')}},
 {name:'OTHER_PLAIN',type:'plain_text',get text(){throw Error('unknown value read')}},...lease]
const version=id=>({id,resources:{bindings:bindings(),script_runtime:{
 compatibility_date:'2026-07-25',compatibility_flags:['nodejs_compat'],usage_model:'standard',
 assets:{get jwt(){throw Error('asset jwt read')}}}}})
function harness(options={}){
 let active=activeVersion,latest=activeVersion
 const calls=[]
 const fetchImpl=async(url,request)=>{
  const suffix=url.split(target.worker)[1];calls.push({suffix,...request})
  let result
  if(request.method==='POST'&&suffix==='/versions?bindings_inherit=strict'){
   latest=next;result={id:options.uploadId??next}
  }else if(request.method==='POST'&&suffix==='/deployments'){
   const body=JSON.parse(request.body)
   assert.deepEqual(body.versions,[{version_id:next,percentage:100}])
   active=next;result={id:deploymentId,versions:body.versions}
  }else if(suffix==='/deployments')result={deployments:[{versions:[{version_id:active,percentage:100}]}]}
  else if(suffix==='/settings')result={bindings:bindings(),compatibility_date:'2026-07-25',
   compatibility_flags:['nodejs_compat'],usage_model:'standard',limits:null,placement:{},
   observability:null,logpush:false,tail_consumers:[]}
  else if(suffix==='/script-settings')result={tags:null,observability:null,logpush:false,tail_consumers:null}
  else if(suffix==='/subdomain')result={enabled:true,previews_enabled:false}
  else if(suffix==='/versions')result={items:[{id:options.latestConflict&&latest===activeVersion?next:latest}]}
  else if(suffix==='/versions/'+activeVersion||suffix==='/versions/'+next){
   result=version(suffix.endsWith(next)?next:activeVersion)
   if(options.pendingDrift&&suffix.endsWith(next))result.resources.script_runtime.placement={}
  }else assert.fail('unexpected endpoint '+suffix)
  if(options.mutate)options.mutate({calls,result,suffix,request,active,latest})
  if(options.failAt===calls.length)throw Error('untrusted transport detail')
  if(options.refuseAt===calls.length)return {ok:false,status:503,json:async()=>({success:false,errors:[{code:999,message:'private upstream error'}]})}
  if(options.invalidJSONAt===calls.length)return {ok:true,status:200,json:async()=>{throw Error('private body')}}
  return {ok:true,status:200,json:async()=>({success:true,result})}
 }
 return {calls,deps:{skipSelfHash:true,verifyPayload:async()=>payload,
   readModule:async file=>bytes.get('frontend/'+file.split('/frontend/')[1]),fetchImpl}}
}
test('one upload and one exact returned-UUID deploy; no other writes or settings changes',async()=>{
 const h=harness(),r=await releaseNative(env(),h.deps)
 assert.equal(r.status,'PUBLISHED_METADATA_CONFIRMED');assert.equal(r.metadataComparison,'EQUAL')
 assert.equal(r.counts.upload,1);assert.equal(r.counts.deploy,1)
 const writes=h.calls.filter(x=>x.method==='POST')
 assert.deepEqual(writes.map(x=>x.suffix),['/versions?bindings_inherit=strict','/deployments'])
 assert(h.calls.every(x=>x.redirect==='error'&&!['PATCH','DELETE','PUT'].includes(x.method)))
 assert(!JSON.stringify(r).includes(env().CLOUDFLARE_API_TOKEN))
 assert.equal(r.before.scriptSettings.observability.state,'null')
 assert.equal(r.after.versionMetadata.runtime.runtime.placement.state,'missing')
 assert.equal(r.after.versionMetadata.runtime.runtime.limits.state,'missing')
})
test('every failing HTTP position stops; no repeated write, rollback or silent success',async()=>{
 const control=harness();await releaseNative(env(),control.deps)
 for(let failAt=1;failAt<=control.calls.length;failAt++){
  const h=harness({failAt}),r=await releaseNative(env(),h.deps)
  assert.equal(r.status,'STOP','position '+failAt)
  assert(h.calls.filter(x=>x.method==='POST'&&x.suffix.startsWith('/versions')).length<=1)
  assert(h.calls.filter(x=>x.method==='POST'&&x.suffix==='/deployments').length<=1)
  assert.equal(r.automaticRetry,false);assert.equal(r.automaticRollback,false);assert.equal(r.versionDeletion,false)
  // The sole permissible extra call after a possible write is independent deployment readback.
  assert(h.calls.length<=failAt+1)
 }
})
test('unknown upload UUID and changed staged runtime never cut over',async()=>{
 for(const opts of [{uploadId:'not-a-uuid'},{uploadId:activeVersion},{pendingDrift:true}]){
  const h=harness(opts),r=await releaseNative(env(),h.deps)
  assert.equal(r.status,'STOP');assert.equal(r.counts.upload,1);assert.equal(r.counts.deploy,0)
 }
})
test('HTTP refusal is not retried; unknown deployment commit only reads back and remains STOP',async()=>{
 const a=harness({refuseAt:7}),ar=await releaseNative(env(),a.deps)
 assert.equal(ar.status,'STOP');assert.equal(ar.reason,'FIXED_API_REFUSED')
 assert.equal(ar.counts.upload,1);assert.equal(ar.counts.deploy,0)
 assert(!JSON.stringify(ar).includes('private upstream error'))
 const b=harness({invalidJSONAt:15}),br=await releaseNative(env(),b.deps)
 assert.equal(br.status,'STOP');assert.equal(br.reason,'FIXED_API_INVALID_JSON')
 assert.equal(br.counts.upload,1);assert.equal(br.counts.deploy,1)
 assert.equal(br.deployMayHaveStarted,true);assert.equal(br.independentReadback.version,next)
 assert.equal(b.calls.length,16)
})
test('baseline source conflict or latest drift refuses upload; precut drift refuses deploy',async()=>{
 const a=harness({latestConflict:true}),ar=await releaseNative(env(),a.deps)
 assert.equal(ar.reason,'INHERITANCE_BASELINE_DRIFT');assert.equal(ar.counts.upload,0)
 const b=harness({mutate:({result,suffix,calls})=>{
  if(suffix==='/script-settings'&&calls.length>7)result.observability={enabled:false}
 }}),br=await releaseNative(env(),b.deps)
 assert.equal(br.reason,'BASELINE_CHANGED_BEFORE_CUTOVER');assert.equal(br.counts.deploy,0)
 const c=harness({mutate:({result,suffix})=>{
  if(suffix==='/versions/'+activeVersion)result.resources.bindings=result.resources.bindings.filter(x=>x.name!=='OTHER_PLAIN')
 }}),cr=await releaseNative(env(),c.deps)
 assert.equal(cr.reason,'BINDING_SOURCE_CONFLICT');assert.equal(cr.counts.upload,0)
})
test('multipart is the sealed five files only, with inheritance and no script-level/default fields',async()=>{
 const {form,metadata}=await multipart(payload,async file=>bytes.get('frontend/'+file.split('/frontend/')[1]))
 assert.deepEqual([...form.keys()].sort(),['metadata',...names].sort())
 assert.equal(metadata.keep_assets,true)
 assert.deepEqual(metadata.keep_bindings,['plain_text','json','secret_text','secret_key','assets'])
 for(const key of ['observability','logpush','tags','tail_consumers','placement','limits'])assert(!Object.hasOwn(metadata,key))
 assert.deepEqual(JSON.parse(form.get('metadata')),metadata)
 for(const name of names)assert.equal(sha(Buffer.from(await form.get(name).arrayBuffer())),sha(bytes.get('frontend/'+name)))
 await assert.rejects(multipart(payload,async()=>Buffer.from('changed')),/MODULE_BYTES_DRIFT/)
})
test('object key order is irrelevant, but lease values and runtime source conflicts still refuse writes',async()=>{
 const a=harness({mutate:({result,suffix})=>{
  if(suffix.startsWith('/versions/'))result.resources.bindings.reverse()
 }}),ar=await releaseNative(env(),a.deps)
 assert.equal(ar.status,'PUBLISHED_METADATA_CONFIRMED')
 const b=harness({mutate:({result,suffix})=>{
  if(suffix==='/versions/'+activeVersion)result.resources.bindings.find(x=>x.name==='B17_WINDOW_PHASE').text='OTHER'
 }}),br=await releaseNative(env(),b.deps)
 assert.equal(br.reason,'BINDING_SOURCE_CONFLICT');assert.equal(br.counts.upload,0)
 const c=harness({mutate:({result,suffix})=>{
  if(suffix==='/settings')result.compatibility_date='2026-01-01'
 }}),cr=await releaseNative(env(),c.deps)
 assert.equal(cr.reason,'RUNTIME_SOURCE_CONFLICT');assert.equal(cr.counts.upload,0)
})
test('real approved manifest and module bytes remain unchanged through multipart transport',async()=>{
 const real=await verifyPayload()
 const {form,moduleSHA256,bytesSHA}=await multipart(real)
 for(const module of real.modules){
  const name=module.path.split('/')[1]
  assert.equal(bytesSHA[name],module.sha256)
  assert.equal(sha(Buffer.from(await form.get(name).arrayBuffer())),module.sha256)
 }
 assert.equal(real.manifestSHA256,target.manifestSHA256)
})
test('wrong mode/hash/context yields zero GETs and zero writes',async()=>{
 for(const patch of [{NATIVE_VERSION_PUBLISH:'false'},{GITHUB_RUN_ATTEMPT:'2'}]){
  const h=harness(),r=await releaseNative({...env(),...patch},h.deps)
  assert.equal(r.status,'STOP');assert.equal(h.calls.length,0)
 }
 const h=harness(),r=await releaseNative(env(),{...h.deps,skipSelfHash:false})
 assert.equal(r.reason,'NATIVE_PUBLISHER_SHA_MISMATCH');assert.equal(h.calls.length,0)
})
test('generalized version projection accepts only exact expected UUID and unknown fields still stop',()=>{
 assert.equal(projectVersion(version(next),next).id,next)
 assert.throws(()=>projectVersion(version(next)),/FIXED_VERSION_METADATA_REFUSED/)
 assert.throws(()=>projectVersion(version(next),'bad'),/FIXED_VERSION_METADATA_REFUSED/)
 const value=version(next);value.resources.script_runtime.limits={unknown:10}
 assert.throws(()=>versionMetadata(value,next),/NON_SECRET_FIELD_SHAPE_REFUSED/)
})
