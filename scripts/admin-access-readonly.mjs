import {writeFile,appendFile} from 'node:fs/promises'
import {guard,target} from './admin-preview-ci.mjs'
const id='41622c7f-6db4-438f-aa9e-cc00e2a56033'
const domain='fastlink-admin-preview-b13.adhesive-snowshoe.workers.dev'
let result
try {
 guard(process.env)
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/access/apps/${id}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,Accept:'application/json'}})
 let v;try{v=await r.json()}catch{throw Error('ACCESS_RESULT_NOT_JSON')}
 const codes=Array.isArray(v.errors)?v.errors.map(e=>e.code).filter(n=>Number.isSafeInteger(n)):[]
 if(!r.ok||v.success!==true)result={status:'ACCESS_MANAGEMENT_REFUSED',httpStatus:r.status,errorCodes:codes,account:target.account,applicationId:id,mutationCount:0}
 else if(v.result?.id!==id||v.result?.domain!==domain)result={status:'ACCESS_APP_BINDING_MISMATCH',account:target.account,applicationId:id,mutationCount:0}
 else result={status:'ACCESS_APP_READ_CONFIRMED',account:target.account,applicationId:id,domain,type:v.result.type,sessionDuration:v.result.session_duration,mutationCount:0,writePermission:'NOT_VERIFIED'}
} catch(e){result={status:'STOP',reason:/^[A-Z0-9_]{1,80}$/.test(e?.message||'')?e.message:'ACCESS_FIXED_READ_FAILED',mutationCount:0}}
const safe=JSON.stringify(result,null,2)
console.log(safe)
if(process.env.PREVIEW_RESULT_FILE)await writeFile(process.env.PREVIEW_RESULT_FILE,safe+'\n',{mode:0o600})
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'```json\n'+safe+'\n```\n')
if(result.status!=='ACCESS_APP_READ_CONFIRMED')process.exitCode=1
