import {readFile,writeFile,appendFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
import {guard,target,Stop,verifyPayload,safeSettings} from './admin-revenue-read-ci.mjs'
import {activeVersion,projectVersion,projectLatest,projectScriptSettings} from './admin-readonly-metadata-ci.mjs'
const root=path.resolve('ci/admin-revenue-read-b17')
const sha=b=>createHash('sha256').update(b).digest('hex')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const equal=isDeepStrictEqual
const retained=['plain_text','json','secret_text','secret_key','assets']
export function deployment(value) {
  const current=value?.deployments?.[0]
  if(!current||!Array.isArray(current.versions)||current.versions.length!==1||
    current.versions[0].percentage!==100||!uuid.test(current.versions[0].version_id||''))
    throw new Stop('ACTIVE_DEPLOYMENT_AMBIGUOUS')
  return {version:current.versions[0].version_id,percentage:100}
}
export function versionMetadata(value,expected) {
  const projected=projectVersion(value,expected)
  const bindings=safeSettings({bindings:value.resources.bindings})
  const {id,...runtime}=projected
  return {runtime,bindings:bindings.bindings,lease:bindings.lease}
}
export function assertSource(before) {
  if(before.deployment.version!==activeVersion||before.latest.firstReturnedVersionId!==activeVersion)
    throw new Stop('INHERITANCE_BASELINE_DRIFT')
  const expected=projectScriptSettings({tags:null,observability:null,logpush:false,tail_consumers:null})
  if(!equal(before.scriptSettings,expected))throw new Stop('SCRIPT_SETTINGS_BASELINE_DRIFT')
  const r=before.versionMetadata.runtime.runtime
  if(!equal(r.compatibilityDate,{state:'value',value:'2026-07-25'})||
    !equal(r.compatibilityFlags,{state:'value',value:['nodejs_compat']})||
    !equal(r.usageModel,{state:'value',value:'standard'})||
    r.placement.state!=='missing'||r.limits.state!=='missing')
    throw new Stop('RUNTIME_BASELINE_DRIFT')
  if(before.settings.compatibilityDate!==r.compatibilityDate.value||
    !equal(before.settings.compatibilityFlags,r.compatibilityFlags.value)||
    before.settings.usageModel!==r.usageModel.value)throw new Stop('RUNTIME_SOURCE_CONFLICT')
  if(!equal(before.versionMetadata.bindings,before.settings.bindings)||
    !equal(before.versionMetadata.lease,before.settings.lease))throw new Stop('BINDING_SOURCE_CONFLICT')
  if(before.domain?.enabled!==true||before.domain?.previews_enabled!==false)
    throw new Stop('DOMAIN_BASELINE_DRIFT')
}
export async function multipart(payload,read=readFile) {
  const modules=payload.modules
  if(modules.length!==5||new Set(modules.map(x=>x.path)).size!==5)
    throw new Stop('EXACT_FIVE_MODULES_REQUIRED')
  const form=new FormData()
  const metadata={main_module:'worker.js',compatibility_date:'2026-07-25',
    compatibility_flags:['nodejs_compat'],bindings:[],keep_assets:true,keep_bindings:retained}
  form.set('metadata',JSON.stringify(metadata))
  const bytesSHA={}
  for(const module of modules) {
    if(!/^frontend\/(worker\.js|admin-inline-public\.mjs|admin-release-identity\.mjs|admin-restored-read-routing\.mjs|safe-preview-diagnostics\.mjs)$/.test(module.path))
      throw new Stop('MODULE_PATH_REFUSED')
    const bytes=await read(path.join(root,module.path))
    if(bytes.length!==module.bytes||sha(bytes)!==module.sha256)throw new Stop('MODULE_BYTES_DRIFT')
    const name=path.basename(module.path)
    form.set(name,new Blob([bytes],{type:'application/javascript+module'}),name)
    bytesSHA[name]=sha(bytes)
  }
  return {form,bytesSHA,metadata}
}
export async function releaseNative(env,deps={}) {
  let phase='CONTEXT',uploadedVersion=null,uploadMayHaveStarted=false,deployMayHaveStarted=false
  const counts={get:0,upload:0,deploy:0}
  let before,after,payload,moduleSHA256
  const fetchImpl=deps.fetchImpl||fetch
  const api=async(suffix,method='GET',body)=>{
    if(method==='POST'){
      const key=suffix==='/versions?bindings_inherit=strict'?'upload':suffix==='/deployments'?'deploy':null
      if(!key||counts[key]!==0)throw new Stop('WRITE_PATH_OR_REPLAY_REFUSED')
      counts[key]++
    }else if(method==='GET')counts.get++
    else throw new Stop('HTTP_METHOD_REFUSED')
    let response
    try{response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+target.account+
      '/workers/scripts/'+target.worker+suffix,{method,body,redirect:'error',signal:AbortSignal.timeout(20000),
        headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json',
          ...(method==='POST'&&typeof body==='string'?{'Content-Type':'application/json'}:{})}})}
    catch{throw new Stop('FIXED_API_TRANSPORT_FAILED')}
    let envelope
    try{envelope=await response.json()}catch{throw new Stop('FIXED_API_INVALID_JSON')}
    if(!response.ok||envelope?.success!==true)throw new Stop('FIXED_API_REFUSED',{httpStatus:response.status,
      platformCodes:Array.isArray(envelope?.errors)?envelope.errors.map(x=>x?.code).filter(Number.isSafeInteger):[]})
    return envelope.result
  }
  const snapshot=async expected=>{
    const settings=safeSettings(await api('/settings'))
    const scriptSettings=projectScriptSettings(await api('/script-settings'))
    const domainRaw=await api('/subdomain')
    if(typeof domainRaw?.enabled!=='boolean'||typeof domainRaw?.previews_enabled!=='boolean')
      throw new Stop('DOMAIN_SHAPE_REFUSED')
    const domain={enabled:domainRaw.enabled,previews_enabled:domainRaw.previews_enabled}
    const latest=projectLatest(await api('/versions'))
    const version=versionMetadata(await api('/versions/'+expected),expected)
    const current=deployment(await api('/deployments'))
    if(current.version!==expected)throw new Stop('ACTIVE_VERSION_DRIFT')
    return {deployment:current,settings,scriptSettings,domain,latest,versionMetadata:version}
  }
  try{
    guard(env)
    if(env.NATIVE_VERSION_PUBLISH!=='true')throw new Stop('NATIVE_MODE_REFUSED')
    if(!deps.skipSelfHash&&sha(await readFile(fileURLToPath(import.meta.url)))!==env.APPROVED_NATIVE_PUBLISHER_SHA)
      throw new Stop('NATIVE_PUBLISHER_SHA_MISMATCH')
    phase='PAYLOAD';payload=await (deps.verifyPayload||verifyPayload)()
    phase='BASELINE';before=await snapshot(activeVersion);assertSource(before)
    phase='MULTIPART';const upload=await multipart(payload,deps.readModule||readFile);moduleSHA256=upload.bytesSHA
    phase='UPLOAD';uploadMayHaveStarted=true
    const created=await api('/versions?bindings_inherit=strict','POST',upload.form)
    if(!uuid.test(created?.id||'')||created.id===activeVersion)throw new Stop('UNIQUE_UPLOADED_VERSION_UNCONFIRMED')
    uploadedVersion=created.id
    phase='UPLOADED_METADATA'
    const pending=versionMetadata(await api('/versions/'+uploadedVersion),uploadedVersion)
    if(!equal(pending,before.versionMetadata))throw new Stop('UPLOADED_RUNTIME_OR_BINDING_DRIFT')
    phase='BEFORE_CUTOVER'
    const stable=await snapshot(activeVersion)
    if(stable.latest.firstReturnedVersionId!==uploadedVersion)throw new Stop('UPLOADED_VERSION_NOT_LATEST')
    // Only the new version directory entry is expected to differ before cutover.
    const {latest:oldLatest,...oldStable}=before
    const {latest:newLatest,...newStable}=stable
    if(!equal(oldStable,newStable))throw new Stop('BASELINE_CHANGED_BEFORE_CUTOVER')
    phase='DEPLOY';deployMayHaveStarted=true
    const switched=await api('/deployments','POST',JSON.stringify({strategy:'percentage',
      versions:[{version_id:uploadedVersion,percentage:100}],
      annotations:{'workers/message':'B17 revenue snapshot '+target.sourceSnapshot+' transport '+env.GITHUB_SHA}}))
    if(!uuid.test(switched?.id||'')||!Array.isArray(switched.versions)||switched.versions.length!==1||
      switched.versions[0].version_id!==uploadedVersion||switched.versions[0].percentage!==100)
      throw new Stop('DEPLOYMENT_RESPONSE_UNCONFIRMED')
    phase='AFTER_METADATA';after=await snapshot(uploadedVersion)
    if(after.latest.firstReturnedVersionId!==uploadedVersion||
      !equal(before.settings,after.settings)||!equal(before.scriptSettings,after.scriptSettings)||
      !equal(before.domain,after.domain)||!equal(before.versionMetadata,after.versionMetadata))
      throw new Stop('POST_DEPLOYMENT_METADATA_DRIFT')
    return {status:'PUBLISHED_METADATA_CONFIRMED',phase,account:target.account,worker:target.worker,
      transportCommit:env.GITHUB_SHA,sourceSnapshot:target.sourceSnapshot,payload,moduleSHA256,
      before,after,publishResult:{version:uploadedVersion,deploymentId:switched.id},counts,
      metadataComparison:'EQUAL',secretValuesCompared:'NOT_READ_OR_COMPARED',browserAcceptance:'NOT_VERIFIED_BY_CI'}
  }catch(e){
    const error=e instanceof Stop?e:new Stop('UNEXPECTED_SAFE_STOP')
    let independentReadback
    if(uploadMayHaveStarted||deployMayHaveStarted){
      try{independentReadback=deployment(await api('/deployments'))}
      catch{independentReadback={status:'UNCONFIRMED'}}
    }
    return {status:'STOP',phase,reason:error.code,details:error.details,account:target.account,
      worker:target.worker,transportCommit:env.GITHUB_SHA,sourceSnapshot:target.sourceSnapshot,
      before,after,uploadedVersion,uploadMayHaveStarted,deployMayHaveStarted,independentReadback,counts,
      automaticRetry:false,automaticRollback:false,versionDeletion:false}
  }
}
async function main(){
  const result=await releaseNative(process.env)
  if(result.status!=='PUBLISHED_METADATA_CONFIRMED')process.exitCode=1
  const bytes=JSON.stringify(result,null,2)+'\n'
  if(process.env.PREVIEW_RESULT_FILE)await writeFile(process.env.PREVIEW_RESULT_FILE,bytes,{flag:'wx',mode:0o600})
  console.log(bytes)
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'\x60\x60\x60json\n'+bytes+'\x60\x60\x60\n')
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(()=>{console.error('SAFE_RECEIPT_WRITE_FAILED');process.exitCode=1})
