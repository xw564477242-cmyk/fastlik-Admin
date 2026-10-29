import test from 'node:test'
import assert from 'node:assert/strict'
import {collect,field,projectScriptSettings,projectVersion,projectLatest,activeVersion} from './admin-readonly-metadata-ci.mjs'
import {target} from './admin-revenue-read-ci.mjs'
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:target.repository,GITHUB_REF:target.ref,
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),
 SEALED_COMMIT:'a'.repeat(40),GITHUB_WORKFLOW_REF:target.repository+'/.github/workflows/ci.yml@'+target.ref,
 HOSTED_ACCOUNT_ID:target.account,CLOUDFLARE_API_TOKEN:'offline-fixture-not-real',READONLY_METADATA_ONLY:'true'})
const version=()=>({id:activeVersion,resources:{script_runtime:{
 compatibility_date:'2026-07-25',compatibility_flags:['nodejs_compat'],placement:{},limits:null}}})
test('missing/null/empty/false remain distinct without defaults',()=>{
 assert.deepEqual(field({},'x',()=>true),{state:'missing'})
 assert.deepEqual(field({x:null},'x',()=>true),{state:'null'})
 assert.deepEqual(field({x:{}},'x',()=>true),{state:'value',value:{}})
 assert.deepEqual(projectScriptSettings({observability:{enabled:false}}).observability,{state:'value',value:{enabled:false}})
 assert.deepEqual(projectVersion(version()).runtime.placement,{state:'value',value:{}})
 assert.deepEqual(projectVersion(version()).runtime.limits,{state:'null'})
})
test('unknown nested fields are refused and no secret/binding/source properties accessed',()=>{
 const forbidden=()=>{throw Error('forbidden getter')}
 assert.throws(()=>projectScriptSettings({observability:{unexpected:'private'}}),/NON_SECRET_FIELD_SHAPE_REFUSED/)
 const input=version()
 Object.defineProperty(input.resources,'bindings',{get:forbidden})
 Object.defineProperty(input.resources.script_runtime,'unknown',{get:forbidden})
 input.resources.assets={id:'public-association',get jwt(){return forbidden()}}
 input.resources.script={get source(){return forbidden()}}
 assert.equal(projectVersion(input).assets.id.value,'public-association')
})
test('only three fixed GETs once; safe result has no raw fields or credentials',async()=>{
 const calls=[],values=[{tags:[],observability:null},{items:[{id:activeVersion}]},version()]
 const result=await collect(env(),{skipSelfHash:true,fetchImpl:async(url,options)=>{
  calls.push({url,options});return {ok:true,status:200,json:async()=>({success:true,result:values.shift()})}
 }})
 assert.equal(result.status,'READ_ONLY_METADATA_COLLECTED');assert.equal(result.requests,3)
 assert.deepEqual(calls.map(x=>x.url.split(target.worker)[1]),['/script-settings','/versions','/versions/'+activeVersion])
 assert(calls.every(x=>x.options.method==='GET'&&x.options.redirect==='error'))
 assert.equal(result.publishCalls,0);assert.equal(result.cloudflareWriteCalls,0)
 assert(!JSON.stringify(result).includes(env().CLOUDFLARE_API_TOKEN))
})
test('authentication or transport failure stops before remaining GETs; no replay',async()=>{
 for(const transport of [false,true]){
 let count=0
 const result=await collect(env(),{skipSelfHash:true,fetchImpl:async()=>{
  count++;if(transport)throw Error('private transport text')
  return {ok:false,status:401,json:async()=>({success:false,errors:[{code:10000,message:'private message'}]})}
 }})
 assert.equal(count,1);assert.equal(result.status,'STOP');assert.equal(result.requests,1)
 assert(!JSON.stringify(result).includes('private'))
 }
})
test('guard mismatch or reader hash mismatch produces zero network',async()=>{
 for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{HOSTED_ACCOUNT_ID:'other'},{READONLY_METADATA_ONLY:'false'}]){
 let count=0
 const result=await collect({...env(),...patch},{skipSelfHash:true,fetchImpl:async()=>count++})
 assert.equal(result.status,'STOP');assert.equal(count,0)
 }
 let count=0
 const result=await collect(env(),{fetchImpl:async()=>count++})
 assert.equal(result.reason,'READER_SHA_MISMATCH');assert.equal(count,0)
})
test('fixed runtime ID mismatch stops, and directory disagreement is explicit not a default',()=>{
 assert.throws(()=>projectVersion({...version(),id:'11111111-2222-4333-8444-555555555555'}),/FIXED_VERSION_METADATA_REFUSED/)
 const value=projectLatest({items:[{id:'11111111-2222-4333-8444-555555555555'}]})
 assert.equal(value.matchesKnownActive,false)
 assert.equal(value.ordering,'API_FIRST_ITEM_NOT_INDEPENDENTLY_ASSERTED_AS_LATEST')
})
test('a projection failure stops before any later endpoint',async()=>{
 let count=0
 const result=await collect(env(),{skipSelfHash:true,fetchImpl:async()=>{
  count++;return {ok:true,status:200,json:async()=>({success:true,result:{observability:{unrecognized:true}}})}
 }})
 assert.equal(count,1);assert.equal(result.reason,'NON_SECRET_FIELD_SHAPE_REFUSED');assert.equal(result.publishCalls,0)
})
