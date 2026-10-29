import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {guard,target,Stop} from './admin-revenue-read-ci.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
export const activeVersion='ed8d2086-4e8c-4dc4-838e-5b15c21619e2'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const string=v=>typeof v==='string'&&v.length<=256
const bool=v=>typeof v==='boolean'
const rate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1
const integer=v=>Number.isSafeInteger(v)&&v>=0
const strings=v=>Array.isArray(v)&&v.length<=100&&v.every(string)
export function field(parent,key,validate) {
  if(!Object.hasOwn(parent,key))return {state:'missing'}
  const value=parent[key]
  if(value===null)return {state:'null'}
  if(!validate(value))throw new Stop('NON_SECRET_FIELD_SHAPE_REFUSED')
  return {state:'value',value:structuredClone(value)}
}
function shape(value,rules) {
  return object(value)&&Object.keys(value).every(k=>Object.hasOwn(rules,k))&&
    Object.entries(value).every(([k,v])=>v===null||rules[k](v))
}
const logs=v=>shape(v,{enabled:bool,head_sampling_rate:rate,invocation_logs:bool,persist:bool,destinations:strings})
const traces=v=>shape(v,{enabled:bool,head_sampling_rate:rate,persist:bool,destinations:strings,
  propagation_policy:v=>['authenticated','accept'].includes(v)})
const obs=v=>shape(v,{enabled:bool,head_sampling_rate:rate,issues:v=>shape(v,{enabled:bool}),
  logs,traces,redact_query_string:bool})
export function projectScriptSettings(value) {
  if(!object(value))throw new Stop('SCRIPT_SETTINGS_SHAPE_REFUSED')
  return {tags:field(value,'tags',strings),observability:field(value,'observability',obs),
    logpush:field(value,'logpush',bool),
    tailConsumers:field(value,'tail_consumers',v=>Array.isArray(v)&&v.length===0)}
}
const placement=v=>shape(v,{mode:v=>['off','smart','targeted'].includes(v),hint:string,
  region:string,host:string,hostname:string})
const limits=v=>shape(v,{cpu_ms:integer,subrequests:integer})
function assetProjection(parent,key) {
  if(!Object.hasOwn(parent,key))return {state:'missing'}
  const value=parent[key]
  if(value===null)return {state:'null'}
  if(!object(value))throw new Stop('ASSETS_METADATA_SHAPE_REFUSED')
  // Do not enumerate/read jwt, binding values or any unknown nested property.
  return {state:'value',id:field(value,'id',string),
    config:field(value,'config',v=>shape(v,{html_handling:string,not_found_handling:string,
      base_path:string,run_worker_first:v=>bool(v)||strings(v)}))}
}
export function projectVersion(value,expectedVersion=activeVersion) {
  if(!uuid.test(expectedVersion)||!object(value)||value.id!==expectedVersion||!object(value.resources)||
      !object(value.resources.script_runtime))throw new Stop('FIXED_VERSION_METADATA_REFUSED')
  const runtime=value.resources.script_runtime
  const script=object(value.resources.script)?value.resources.script:{}
  return {id:value.id,runtime:{
    compatibilityDate:field(runtime,'compatibility_date',string),
    compatibilityFlags:field(runtime,'compatibility_flags',strings),
    usageModel:field(runtime,'usage_model',v=>['standard','bundled','unbound'].includes(v)),
    placement:field(runtime,'placement',placement),limits:field(runtime,'limits',limits),
    assets:assetProjection(runtime,'assets')
  },assets:assetProjection(value.resources,'assets'),scriptAssets:assetProjection(script,'assets')}
}
export function projectLatest(value) {
  if(!object(value)||!Array.isArray(value.items)||!value.items.length||
      !uuid.test(value.items[0]?.id||''))throw new Stop('VERSION_LIST_SHAPE_REFUSED')
  return {firstReturnedVersionId:value.items[0].id,
    matchesKnownActive:value.items[0].id===activeVersion,
    ordering:'API_FIRST_ITEM_NOT_INDEPENDENTLY_ASSERTED_AS_LATEST'}
}
export async function collect(env,deps={}) {
  let phase='CONTEXT',requests=0
  const safe={}
  try {
    guard(env)
    if(env.READONLY_METADATA_ONLY!=='true')throw new Stop('READONLY_MODE_REFUSED')
    if(!deps.skipSelfHash&&sha(await readFile(fileURLToPath(import.meta.url)))!==env.APPROVED_READER_SHA)
      throw new Stop('READER_SHA_MISMATCH')
    const fetchImpl=deps.fetchImpl||fetch
    const get=async suffix=>{
      requests++
      let response
      try {response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+target.account+
        '/workers/scripts/'+target.worker+suffix,{method:'GET',redirect:'error',
        signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,
        Accept:'application/json'}})}
      catch{throw new Stop('FIXED_READ_TRANSPORT_FAILED')}
      let envelope
      try{envelope=await response.json()}catch{throw new Stop('FIXED_READ_INVALID_JSON')}
      if(!response.ok||envelope?.success!==true)throw new Stop('FIXED_READ_REFUSED',{httpStatus:response.status,
        platformCodes:Array.isArray(envelope?.errors)?envelope.errors.map(x=>x?.code).filter(Number.isSafeInteger):[]})
      return envelope.result
    }
    phase='SCRIPT_SETTINGS';safe.scriptSettings=projectScriptSettings(await get('/script-settings'))
    phase='VERSION_DIRECTORY';safe.versionDirectory=projectLatest(await get('/versions'))
    phase='FIXED_ACTIVE_RUNTIME';safe.activeRuntime=projectVersion(await get('/versions/'+activeVersion))
    return {status:'READ_ONLY_METADATA_COLLECTED',phase,account:target.account,worker:target.worker,
      transportCommit:env.GITHUB_SHA,knownActiveVersion:activeVersion,requests,...safe,
      cloudflareWriteCalls:0,publishCalls:0,rawResponseRecorded:false,secretValuesRead:false}
  }catch(e) {
    const error=e instanceof Stop?e:new Stop('UNEXPECTED_SAFE_STOP')
    return {status:'STOP',phase,reason:error.code,details:error.details,
      account:target.account,worker:target.worker,transportCommit:env.GITHUB_SHA,requests,...safe,
      cloudflareWriteCalls:0,publishCalls:0,automaticRetry:false,rawResponseRecorded:false,secretValuesRead:false}
  }
}
async function main(){
  const result=await collect(process.env)
  const bytes=JSON.stringify(result,null,2)+'\n'
  if(result.status!=='READ_ONLY_METADATA_COLLECTED')process.exitCode=1
  if(process.env.READONLY_RESULT_FILE)await writeFile(process.env.READONLY_RESULT_FILE,bytes,{flag:'wx',mode:0o600})
  console.log(bytes)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error('SAFE_RECEIPT_WRITE_FAILED');process.exitCode=1})
