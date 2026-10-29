import {readFile, writeFile, appendFile, lstat, readdir, mkdtemp, symlink} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {stripVTControlCharacters} from 'node:util'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const target = Object.freeze({
  repository:'xw564477242-cmyk/fastlik-Admin',
  ref:'refs/heads/codex/fl-b17-revenue-read-ci-20261029',
  account:'af8ac20dee08abe5ec98a892ae83873e', worker:'fastlink-admin-preview-b13',
  previousVersionPrefix:'ed8d2086-',
  manifestSHA256:'0315fae84e3669903471e65b13c296f1570c5683550485cecb8c92e0db2203a7',
  sourceSnapshot:'72e2068f3da57751c3e779ceb2315391df568777f9cdb9c6f712b471828aca33',
  originalArchiveSHA256:'06f7f621b0bf03b7e611126ac9eec4d95c6a0d259e5707dcc8147e266bd55720',
})
const packageRoot = path.resolve('ci/admin-revenue-read-b17')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const moduleNames = ['admin-inline-public.mjs','admin-release-identity.mjs','admin-restored-read-routing.mjs','safe-preview-diagnostics.mjs','worker.js']
const publicNames = ['assets/index-B0-ww0NP.js','assets/index-Cisn8fL9.css','index.html']
const retainedTypes = ['plain_text','json','secret_text','secret_key','assets']
const leaseNames = new Set(['FASTLINK_PREVIEW_DEPLOYMENT_PROFILE','B17_WINDOW_PHASE',
  'B17_RETENTION_UNTIL_UTC','B17_WINDOW_OPEN_UTC','B17_WINDOW_CLOSE_UTC',
  'B17_QUALIFY_UNTIL_UTC','B17_PAID_START_UTC','B17_PAID_STOP_UTC'])
export class Stop extends Error {
  constructor(code, details={}) {super(code); this.code=code; this.details=details}
}
export function guard(env) {
  if (env.GITHUB_ACTIONS!=='true' || env.GITHUB_REPOSITORY!==target.repository ||
      env.GITHUB_REF!==target.ref || env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
      env.GITHUB_RUN_ATTEMPT!=='1' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') ||
      env.SEALED_COMMIT!==env.GITHUB_SHA ||
      env.GITHUB_WORKFLOW_REF!==target.repository+'/.github/workflows/ci.yml@'+target.ref)
    throw new Stop('SEALED_CONTEXT_REFUSED')
  if (!env.CLOUDFLARE_API_TOKEN || !env.HOSTED_ACCOUNT_ID) throw new Stop('HOSTED_CREDENTIAL_UNAVAILABLE')
  if (env.HOSTED_ACCOUNT_ID.trim()!==target.account) throw new Stop('HOSTED_ACCOUNT_MISMATCH')
}
async function listFiles(root, prefix='') {
  const result=[]
  for (const item of await readdir(path.join(root,prefix),{withFileTypes:true})) {
    const rel=path.posix.join(prefix,item.name)
    if (item.isSymbolicLink()) throw new Stop('PAYLOAD_SYMLINK_REFUSED')
    if (item.isDirectory()) result.push(...await listFiles(root,rel))
    else if (item.isFile()) result.push(rel)
    else throw new Stop('PAYLOAD_FILE_TYPE_REFUSED')
  }
  return result.sort()
}
export async function verifyPayload(root=packageRoot) {
  const raw=await readFile(path.join(root,'APPROVED-MANIFEST.json'))
  if (sha(raw)!==target.manifestSHA256) throw new Stop('SEALED_MANIFEST_SHA_MISMATCH')
  const manifest=JSON.parse(raw)
  if (manifest.sourceSnapshot!==target.sourceSnapshot ||
      manifest.originalFiveModuleArchiveSHA256!==target.originalArchiveSHA256)
    throw new Stop('SOURCE_IDENTITY_REFUSED')
  const allowed=['ORIGINAL-FIVE-MODULES.tar.gz','wrangler.json',
    ...moduleNames.map(n=>'frontend/'+n),...publicNames.map(n=>'public-delta/'+n)].sort()
  if (JSON.stringify(manifest.files.map(f=>f.path).sort())!==JSON.stringify(allowed) ||
      JSON.stringify(await listFiles(root))!==JSON.stringify([...allowed,'APPROVED-MANIFEST.json'].sort()))
    throw new Stop('PAYLOAD_FILE_SET_REFUSED')
  for (const file of manifest.files) {
    const resolved=path.join(root,file.path)
    if (!(await lstat(resolved)).isFile()) throw new Stop('PAYLOAD_FILE_TYPE_REFUSED')
    const bytes=await readFile(resolved)
    if (bytes.length!==file.bytes || sha(bytes)!==file.sha256) throw new Stop('PAYLOAD_SHA_MISMATCH')
  }
  const config=JSON.parse(await readFile(path.join(root,'wrangler.json'),'utf8'))
  if (config.account_id!==target.account || config.name!==target.worker ||
      config.main!=='./frontend/worker.js' || config.no_bundle!==true ||
      config.compatibility_date!=='2026-07-25' ||
      JSON.stringify(config.compatibility_flags)!=='["nodejs_compat"]' ||
      config.workers_dev!==true || config.preview_urls!==false ||
      JSON.stringify(config.routes)!=='[]' || Object.hasOwn(config,'assets') ||
      Object.hasOwn(config,'vars') || config.unsafe?.metadata?.keep_assets!==true ||
      JSON.stringify(config.unsafe?.metadata?.keep_bindings)!==JSON.stringify(retainedTypes))
    throw new Stop('PRESERVATION_CONFIG_REFUSED')
  return {manifestSHA256:sha(raw), sourceSnapshot:manifest.sourceSnapshot,
    originalArchiveSHA256:manifest.originalFiveModuleArchiveSHA256,
    modules:manifest.files.filter(f=>f.path.startsWith('frontend/')),
    publicDelta:manifest.publicDelta, publicDelivery:manifest.publicDelivery}
}
async function api(env, suffix, fetchImpl) {
  let response
  try {
    response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+target.account+
      '/workers/scripts/'+target.worker+suffix, {
      method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json'}
    })
  } catch {throw new Stop('FIXED_METADATA_TRANSPORT_FAILED')}
  let value
  try {value=await response.json()} catch {throw new Stop('FIXED_METADATA_INVALID',{httpStatus:response.status})}
  if (!response.ok || value?.success!==true) throw new Stop('FIXED_METADATA_REFUSED',{
    httpStatus:response.status,
    platformCodes:Array.isArray(value?.errors)?value.errors.map(e=>e?.code).filter(Number.isSafeInteger):[]
  })
  return value.result
}
export function safeSettings(value) {
  if (!value || !Array.isArray(value.bindings)) throw new Stop('SETTINGS_SHAPE_REFUSED')
  const bindings=value.bindings.map(b=>({name:b.name,type:b.type})).sort((a,b)=>a.name.localeCompare(b.name))
  if (bindings.some(b=>typeof b.name!=='string'||!retainedTypes.includes(b.type)) ||
      !bindings.some(b=>b.name==='ASSETS'&&b.type==='assets'))
    throw new Stop('EXISTING_BINDING_SCOPE_REFUSED')
  // Never access secret binding values, unknown plain-text values or their hashes.
  const lease={}
  for(const b of value.bindings) if(b.type==='plain_text'&&leaseNames.has(b.name)) {
    if(typeof b.text!=='string') throw new Stop('LEASE_METADATA_INVALID')
    if(b.name==='FASTLINK_PREVIEW_DEPLOYMENT_PROFILE') {
      if(b.text!=='B17_READONLY_MONTH_V1') throw new Stop('PROFILE_DRIFT')
    } else if(b.name==='B17_WINDOW_PHASE') {
      if(!/^[A-Z_]{1,32}$/.test(b.text)) throw new Stop('LEASE_METADATA_INVALID')
    } else if(!Number.isFinite(Date.parse(b.text))) throw new Stop('LEASE_METADATA_INVALID')
    lease[b.name]=b.text
  }
  if (!Object.hasOwn(lease,'B17_RETENTION_UNTIL_UTC') ||
      !Object.hasOwn(lease,'FASTLINK_PREVIEW_DEPLOYMENT_PROFILE')) throw new Stop('LEASE_METADATA_MISSING')
  return {bindings,lease,compatibilityDate:value.compatibility_date,
    compatibilityFlags:value.compatibility_flags,usageModel:value.usage_model,
    limits:value.limits??null,placement:value.placement??null,logpush:value.logpush??null,
    observability:value.observability??null,tailConsumers:value.tail_consumers??null,
    assetConfig:value.assets?.config??null}
}
export function preservedRuntimeConfig(base,settings) {
  const config=structuredClone(base)
  const obs=settings.observability
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
  const keys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k))
  const rate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1
  if(!object(obs)||!keys(obs,['enabled','head_sampling_rate','logs','traces']))
    throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
  if(Object.hasOwn(obs,'enabled')&&typeof obs.enabled!=='boolean') throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
  if(Object.hasOwn(obs,'head_sampling_rate')&&!rate(obs.head_sampling_rate)) throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
  if(!Object.hasOwn(obs,'enabled')&&!Object.hasOwn(obs,'logs')&&!Object.hasOwn(obs,'traces')) throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
  for(const kind of ['logs','traces']) if(Object.hasOwn(obs,kind)) {
    const value=obs[kind]
    const allowed=kind==='logs'?['enabled','head_sampling_rate','invocation_logs','persist','destinations']:['enabled','head_sampling_rate','persist','destinations']
    if(!object(value)||!keys(value,allowed)) throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
    for(const key of ['enabled','invocation_logs','persist'])
      if(Object.hasOwn(value,key)&&typeof value[key]!=='boolean') throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
    if(Object.hasOwn(value,'head_sampling_rate')&&!rate(value.head_sampling_rate)) throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
    if(Object.hasOwn(value,'destinations')&&(!Array.isArray(value.destinations)||value.destinations.some(v=>typeof v!=='string'||v.length>256)))
      throw new Stop('OBSERVABILITY_PRESERVATION_UNCONFIRMED')
  }
  config.observability=structuredClone(obs)
  if(settings.limits!==null&&settings.limits!==undefined) {
    const value=settings.limits
    if(!object(value)||!keys(value,['cpu_ms','subrequests'])||Object.values(value).some(v=>!Number.isSafeInteger(v)||v<0))
      throw new Stop('LIMITS_PRESERVATION_UNCONFIRMED')
    config.limits=structuredClone(value)
  }
  if(settings.placement!==null&&settings.placement!==undefined) {
    const value=settings.placement
    if(!object(value)||!keys(value,['mode','hint'])||!['off','smart'].includes(value.mode)||
        (Object.hasOwn(value,'hint')&&(value.mode!=='smart'||typeof value.hint!=='string'||value.hint.length>256)))
      throw new Stop('PLACEMENT_PRESERVATION_UNCONFIRMED')
    config.placement=structuredClone(value)
  }
  return config
}
export async function metadata(env, fetchImpl) {
  const deployment=await api(env,'/deployments',fetchImpl)
  const current=deployment?.deployments?.[0]
  if(!current || !Array.isArray(current.versions) || current.versions.length!==1 ||
      current.versions[0].percentage!==100 || !uuid.test(current.versions[0].version_id||'') ||
      !Number.isFinite(Date.parse(current.created_on)))
    throw new Stop('FIXED_DEPLOYMENT_AMBIGUOUS')
  const settings=safeSettings(await api(env,'/settings',fetchImpl))
  if(settings.compatibilityDate!=='2026-07-25' ||
      JSON.stringify(settings.compatibilityFlags)!=='["nodejs_compat"]') throw new Stop('COMPATIBILITY_DRIFT')
  const domain=await api(env,'/subdomain',fetchImpl)
  if(domain?.enabled!==true || domain?.previews_enabled!==false) throw new Stop('DOMAIN_SETTING_DRIFT')
  return {version:current.versions[0].version_id,createdOn:current.created_on,settings,
    domain:{enabled:domain.enabled,previewsEnabled:domain.previews_enabled}}
}
export async function publish(env,before,effectiveConfig) {
  if(!path.isAbsolute(env.WRANGLER_BIN||'')||!path.isAbsolute(env.RUNNER_TEMP||'')) throw new Stop('PINNED_TOOL_UNAVAILABLE')
  // A separate temporary configuration carries only validated non-secret inherited settings.
  // The locally sealed input/config/manifest and all five modules remain untouched.
  const effectiveBytes=JSON.stringify(effectiveConfig,null,2)+'\n'
  await writeFile(path.join(packageRoot,'wrangler.inherited-settings.json'),effectiveBytes,{mode:0o600,flag:'wx'})
  const logDir=await mkdtemp(path.join(env.RUNNER_TEMP,'fl-b17-revenue-log-'))
  const logSink=path.join(logDir,'null.log'); await symlink('/dev/null',logSink)
  const childEnv={...env,CLOUDFLARE_ACCOUNT_ID:target.account,CI:'true',WRANGLER_SEND_METRICS:'false',
    WRANGLER_LOG_PATH:logSink,CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false'}
  for(const name of ['HOSTED_ACCOUNT_ID','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','DEBUG']) delete childEnv[name]
  return new Promise((resolve,reject)=>{
    const child=spawn(env.WRANGLER_BIN,['deploy','--config','wrangler.inherited-settings.json','--keep-vars',
      '--autoconfig=false','--message','B17 revenue readonly snapshot '+target.sourceSnapshot+
      ' transport '+env.GITHUB_SHA],{cwd:packageRoot,env:childEnv,stdio:['ignore','pipe','pipe'],shell:false})
    let output=''
    const collect=data=>{if(output.length<1048576) output+=data.toString()}
    child.stdout.on('data',collect);child.stderr.on('data',collect)
    child.on('error',()=>reject(new Stop('WRANGLER_START_FAILED')))
    child.on('close',(exitCode,signal)=>{
      const clean=stripVTControlCharacters(output)
      const platformCodes=[...clean.matchAll(/\[code:\s*(\d+)\]/g)].map(m=>Number(m[1]))
      const found=/Current Version ID:\s*([0-9a-f-]{36})/i.exec(clean)
      const reportedVersion=found&&uuid.test(found[1])?found[1]:null
      // Do not emit raw stdout/stderr, API responses, auth URLs or debug logs.
      if(exitCode!==0 || !reportedVersion) return reject(new Stop('WRANGLER_PUBLISH_UNCONFIRMED',{
        exitCode,signal,platformCodes,reportedVersion,platformMessage:'NOT_RECORDED_SAFELY'
      }))
      resolve({version:reportedVersion,exitCode,platformCodes,effectiveConfigSHA256:sha(effectiveBytes),
        inheritedNonSecretFields:['observability',...(effectiveConfig.limits?['limits']:[]),...(effectiveConfig.placement?['placement']:[])]})
    })
  })
}
export async function release(env,deps={}) {
  let phase='CONTEXT',before,publishResult
  const fetchImpl=deps.fetchImpl||fetch
  try {
    guard(env)
    phase='PAYLOAD'
    if(!deps.skipSelfHash && sha(await readFile(fileURLToPath(import.meta.url)))!==env.APPROVED_PUBLISHER_SHA)
      throw new Stop('PUBLISHER_SHA_MISMATCH')
    const payload=await (deps.verifyPayload||verifyPayload)()
    phase='BEFORE_METADATA';before=await (deps.metadata||metadata)(env,fetchImpl)
    if(!before.version.startsWith(target.previousVersionPrefix)) throw new Stop('ACTIVE_BASELINE_DRIFT')
    phase='METADATA_PRESERVATION'
    const baseConfig=await (deps.readBaseConfig||(()=>readFile(path.join(packageRoot,'wrangler.json'),'utf8').then(JSON.parse)))()
    const effectiveConfig=preservedRuntimeConfig(baseConfig,before.settings)
    phase='PUBLISH';publishResult=await (deps.publish||publish)(env,before,effectiveConfig)
    phase='AFTER_METADATA'
    const after=await (deps.metadata||metadata)(env,fetchImpl)
    if(after.version===before.version || after.version!==publishResult.version) throw new Stop('ACTIVE_VERSION_MISMATCH')
    if(JSON.stringify(before.settings)!==JSON.stringify(after.settings) ||
        JSON.stringify(before.domain)!==JSON.stringify(after.domain)) throw new Stop('NON_SECRET_METADATA_DRIFT')
    return {status:'PUBLISHED_METADATA_CONFIRMED',phase,account:target.account,worker:target.worker,
      transportCommit:env.GITHUB_SHA,sourceSnapshot:target.sourceSnapshot,payload,
      before,after,publishResult,publishInvocations:1,metadataComparison:'EQUAL',
      secretValuesCompared:'NOT_READ_OR_COMPARED',browserAcceptance:'NOT_VERIFIED_BY_CI'}
  } catch(error) {
    const safe=error instanceof Stop?error:new Stop('UNEXPECTED_SAFE_STOP')
    const possible=phase==='PUBLISH'||phase==='AFTER_METADATA'
    let independentReadback
    if(possible) {
      try{independentReadback=await (deps.metadata||metadata)(env,fetchImpl)}
      catch(e){independentReadback={status:'UNCONFIRMED',reason:e instanceof Stop?e.code:'SAFE_READBACK_FAILED'}}
    }
    return {status:'STOP',phase,reason:safe.code,details:safe.details,account:target.account,
      worker:target.worker,transportCommit:env.GITHUB_SHA,sourceSnapshot:target.sourceSnapshot,
      before,publishResult,publishMayHaveStarted:possible,independentReadback,
      automaticRetry:false,automaticRollback:false}
  }
}
async function main() {
  const result=await release(process.env)
  if(result.status!=='PUBLISHED_METADATA_CONFIRMED') process.exitCode=1
  const safe=JSON.stringify(result,null,2)
  console.log(safe)
  if(process.env.PREVIEW_RESULT_FILE) await writeFile(process.env.PREVIEW_RESULT_FILE,safe+'\n',{mode:0o600,flag:'wx'})
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,'\x60\x60\x60json\n'+safe+'\n\x60\x60\x60\n')
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error('SAFE_RECEIPT_WRITE_FAILED');process.exitCode=1})

