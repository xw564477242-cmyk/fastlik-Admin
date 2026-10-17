import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require=createRequire(path.join(root,'package.json')),ts=require('typescript')
const cache=new Map()
function load(file,overrides={}){
 file=path.resolve(root,file)
 const key=file+JSON.stringify(Object.keys(overrides))
 if(Object.keys(overrides).length===0&&cache.has(key))return cache.get(key)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const module={exports:{}};if(Object.keys(overrides).length===0)cache.set(key,module.exports)
 const local=(id)=>{
  if(id in overrides)return overrides[id]
  if(id.startsWith('.')){let f=path.resolve(path.dirname(file),id);if(!path.extname(f))f+='.ts';return load(f,overrides)}
  return require(id)
 }
 vm.runInNewContext(code,{module,exports:module.exports,require:local,process,Buffer,URL,URLSearchParams,TextDecoder,TextEncoder,Uint8Array,Request,Response,Headers,atob,crypto:overrides.__crypto??globalThis.crypto,console})
 return module.exports
}
let pass=0
async function check(name,fn){if(process.env.B13_TEST_FILTER&&!name.includes(process.env.B13_TEST_FILTER))return;await fn();pass++;console.log('PASS '+name)}
const {previewRequestAllowed}=load('src/launch/preview-readonly-policy.ts')
await check('preview auth lifecycle only; all business mutations denied',()=>{
 for(const target of ['/api/v1/auth/login','/api/v1/auth/refresh','/api/v1/auth/logout','/api/admin/auth/login','/api/admin/auth/logout'])assert.equal(previewRequestAllowed(target,'POST'),true)
 for(const target of ['/api/v1/auth/register','/api/admin/tenants/tenant_a/users/user_a/kyc','/api/admin/tenants/tenant_a/support-cases','/api/v1/cards/card_a/activate','/api/v1/wallet/operations']){
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(previewRequestAllowed(target,method),false)
 }
})
await check('exact readonly route/query allowlist; no arbitrary forwarding',()=>{
 assert.equal(previewRequestAllowed('/api/v1/cards','GET'),true)
 assert.equal(previewRequestAllowed('/api/admin/tenants/tenant_a/support-cases?traceId=trace_test_123','GET'),true)
 for(const target of ['/api/v1/cards?tenantId=other','/api/v1/cards?limit=1&limit=2','/api//v1/cards','/api/v1/%63ards','/api/v1/cards/../wallet','/api/admin/tenants/tenant_a/ledger/accounts'])assert.equal(previewRequestAllowed(target,'GET'),false)
})
if(fs.existsSync(path.join(root,'src/launch/preview-readonly-boundary.ts'))){
 const {previewBoundary}=load('src/launch/preview-readonly-boundary.ts')
 const proof='B13_TEST_ONLY_NO_VALID_SECRET_0000000000000000000000000000'
 const middleware=previewBoundary(proof)
 function run(target,method,header){let forwarded=false,status=0;const req={originalUrl:target,url:target,method,headers:header?{'x-fastlink-preview-gateway':header}:{}};middleware(req,{status(c){status=c;return this},json(){}},()=>{forwarded=true});return {forwarded,status,req}}
 await check('backend exact GET liveness only bypass; all aliases/query/methods rejected',()=>{
  assert.equal(run('/api/health','GET').forwarded,true)
  for(const [target,method] of [['/api/health?x=1','GET'],['/api/health/','GET'],['/api/health','POST'],['/api/health/readiness','GET'],['/api/v1/cards','GET']])assert.equal(run(target,method).status,403)
 })
 await check('backend proof-bound reads; even correct proof cannot mutate',()=>{
  const read=run('/api/v1/cards','GET',proof);assert.equal(read.forwarded,true);assert.equal(read.req.headers['x-fastlink-preview-gateway'],undefined)
  assert.equal(run('/api/v1/cards','GET','client-spoof').status,403)
  assert.equal(run('/api/admin/tenants/tenant_a/users/user_a/kyc','PATCH',proof).status,403)
 })
 const profile=load('src/launch/preview-profile.ts',{'../common/config/env.validation':{validateEnvironment:x=>x}})
 await check('unbound preview rejected before any runtime; legacy role remains distinct',()=>{
  assert.throws(()=>profile.validatePreviewEnvironment({FASTLINK_PREVIEW_MODE:'READ_ONLY'}),/UNBOUND/)
  assert.equal(profile.expectedLaunchRole({}),'b10_runtime_20261017')
  assert.equal(profile.expectedLaunchRole({FASTLINK_PREVIEW_MODE:'READ_ONLY',FASTLINK_PREVIEW_RUNTIME_ROLE:'fl_preview_runtime_fixture'}),'fl_preview_runtime_fixture')
  assert.throws(()=>profile.expectedLaunchRole({FASTLINK_PREVIEW_MODE:'READ_ONLY',FASTLINK_PREVIEW_RUNTIME_ROLE:'b10_runtime_20261017'}),/ROLE/)
 })
 await check('actual bootstrap refuses unbound VM input without importing main',()=>{
  let mainImports=0,exitCode=0
  const proc={platform:'linux',arch:'arm64',getuid:()=>1000,env:{},stderr:{write(){}},get exitCode(){return exitCode},set exitCode(v){exitCode=v}}
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/launch/preview-private-bootstrap.cjs'),'utf8'),{process:proc,require:(name)=>{if(name==='node:fs')return {};mainImports++;throw Error('main must not load')}})
  assert.equal(mainImports,0);assert.equal(exitCode,78)
 })
 await check('frozen readiness and v6 shutdown remain, no legacy fixed role on preview',()=>{
  const main=fs.readFileSync(path.join(root,'src/launch/main.ts'),'utf8'),health=fs.readFileSync(path.join(root,'src/launch/b10-profile.ts'),'utf8')
  for(const text of ['expectedLaunchRole(process.env)','useProcessExit: true','PRISMA_DISCONNECT_ACK','LIFECYCLE_COMPLETE'])assert.ok(main.includes(text))
  assert.ok(health.includes('GATE_FROZEN'));assert.ok(health.includes('ServiceUnavailableException'));assert.ok(health.includes('wholeProjectReady:false'))
 })
 // Only the modified guard/session branch is exercised; no old matrix or database.
 const {AdminBearerGuard}=load('src/admin-auth/admin-bearer.guard.ts',{
  '@prisma/client':{Environment:{TEST:'TEST',SANDBOX:'SANDBOX',PRODUCTION:'PRODUCTION'}},
  '../prisma/prisma.service':{PrismaService:class{}},'./admin-auth.service':{AdminAuthService:class{}}
 })
 const user={id:'test_admin',tenantId:'tenant_a',isActive:true,tenant:{status:'ACTIVE',environment:'TEST'},roles:[]}
 function auth(scopes){return {sessionRecord:async()=>({id:'test_session',expiresAt:new Date(Date.now()+60000),revokedAt:null,tenantUser:{...user,roles:scopes.map(scope=>({role:{code:'fixture',permissions:[{permission:{scope}}]}}))}}),touch:async()=>{}}}
 function request(query={}){return {headers:{authorization:'Bearer B13_TEST_ONLY_INVALID_SESSION_000000000000'},method:'GET',originalUrl:'/api/admin/tenants/tenant_a/support-cases',params:{tenantId:'tenant_a'},query}}
 const saved=process.env.FASTLINK_LAUNCH_PROFILE;process.env.FASTLINK_LAUNCH_PROFILE='B10_WALLET_ADMIN_CONNECTION_V1'
 try{
 await check('preview keeps exact support read scope, not general admin:read fallback',async()=>{
  const denied=request();await assert.rejects(new AdminBearerGuard({},auth(['admin:read'])).canActivate({switchToHttp:()=>({getRequest:()=>denied})}))
  const allowed=request();assert.equal(await new AdminBearerGuard({},auth(['support:cases:read'])).canActivate({switchToHttp:()=>({getRequest:()=>allowed})}),true)
  assert.equal(allowed.fastlinkAuth.authorizedTenantId,'tenant_a')
 })
 await check('latest dev tenant conflicts/invalid fields stay rejected',async()=>{
  for(const query of [{tenantId:'tenant_b'},{tenantId:['tenant_a']}]){
   const req=request(query);await assert.rejects(new AdminBearerGuard({},auth(['support:cases:read'])).canActivate({switchToHttp:()=>({getRequest:()=>req})}))
  }
 })
 }finally{if(saved===undefined)delete process.env.FASTLINK_LAUNCH_PROFILE;else process.env.FASTLINK_LAUNCH_PROFILE=saved}
}else{

 await check('all static assets run authenticated worker first; unapproved alternate URLs off',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.preview.jsonc'),'utf8'))
  assert.equal(config.assets.run_worker_first,true);assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false)
 })
 const edge=load('src/preview-gateway.ts')
 await check('edge unbound target rejected; public proxy label is not authentication',async()=>{
  assert.throws(()=>edge.previewBindings({},'https://preview.example.test'),/UNBOUND/)
  await assert.rejects(edge.previewAccess(new Request('https://preview.example.test/api/v1/cards',{headers:{'x-fastlink-api-proxy':'prime-dev'}}),{}))
 })
 await check('edge strips forged proof/access forwarding and never exports gateway secret',()=>{
  const headers=edge.previewProxyHeaders(new Request('https://preview.example.test/api/v1/cards',{headers:{'x-fastlink-preview-gateway':'attacker','cf-access-jwt-assertion':'not-a-token','x-forwarded-host':'attacker','cookie':'CF_Authorization=fixture; fl_session=fixture'}}),'B13_TEST_ONLY_GATEWAY_NO_VALID_SECRET')
  assert.equal(headers.get('x-fastlink-preview-gateway'),'B13_TEST_ONLY_GATEWAY_NO_VALID_SECRET')
  assert.equal(headers.get('cf-access-jwt-assertion'),null)
  assert.equal(headers.get('x-forwarded-host'),'preview.example.test')
  assert.ok(!headers.get('cookie').includes('CF_Authorization'))
 })

 await check('MOCKED_CRYPTO_CONTROL_FLOW_ONLY actual RS256 call input and verify false refusal',async()=>{
  let calls=[],accept=false
  const mocked={subtle:{importKey:async(...args)=>{calls.push({kind:'import',args});return {}},verify:async(...args)=>{calls.push({kind:'verify',args});return accept}}}
  const api=load('src/preview-gateway.ts',{__crypto:mocked})
  const env={FASTLINK_PREVIEW_STATUS:'OWNER_APPROVED',FASTLINK_PREVIEW_ORIGIN:'https://preview.example.test',FASTLINK_BACKEND_ORIGIN:'https://backend.example.test',
   FASTLINK_BUILD_SHA:'0'.repeat(40),FASTLINK_SOURCE_SNAPSHOT:'1'.repeat(64),FASTLINK_CANDIDATE_ID:'FL-LAUNCH-B13-20261017',
   FASTLINK_PREVIEW_EXPIRES_AT:new Date(Date.now()+60000).toISOString(),FASTLINK_PREVIEW_GATEWAY_PROOF:'B13_TEST_ONLY_NO_VALID_SECRET_00000000000000000000000000000',
   FASTLINK_PREVIEW_ACCESS_ISSUER:'https://synthetic.cloudflareaccess.com',FASTLINK_PREVIEW_ACCESS_AUDIENCE:'b13-fixture-audience',
   FASTLINK_PREVIEW_ALLOWED_EMAILS_JSON:JSON.stringify(['synthetic@example.test']),
   FASTLINK_PREVIEW_ACCESS_JWKS_JSON:JSON.stringify({keys:[{kid:'fixture',kty:'RSA',alg:'RS256',use:'sig',n:'synthetic_public_modulus',e:'AQAB'}]})}
  const header={alg:'RS256',kid:'fixture'},claims={iss:env.FASTLINK_PREVIEW_ACCESS_ISSUER,aud:['b13-fixture-audience'],email:'synthetic@example.test',exp:Math.floor(Date.now()/1000)+60}
  const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
  const token=enc(header)+'.'+enc(claims)+'.'+Buffer.from('NOT_A_REAL_SIGNATURE').toString('base64url')
  const req=()=>new Request('https://preview.example.test/api/v1/cards',{headers:{'cf-access-jwt-assertion':token}})
  await assert.rejects(api.previewAccess(req(),env))
  assert.equal(calls.filter(x=>x.kind==='verify').length,1)
  const verified=calls.find(x=>x.kind==='verify')
  assert.equal(verified.args[0],'RSASSA-PKCS1-v1_5')
  assert.equal(new TextDecoder().decode(verified.args[2]),'NOT_A_REAL_SIGNATURE')
  assert.equal(new TextDecoder().decode(verified.args[3]),token.split('.').slice(0,2).join('.'))
  accept=true;calls=[]
  assert.equal((await api.previewAccess(req(),env)).backend,'https://backend.example.test')
  assert.equal(calls.filter(x=>x.kind==='verify').length,1)
 })
 await check('MOCKED_CRYPTO_CONTROL_FLOW_ONLY claims and private JWK refuse before verify',async()=>{
  let verifies=0
  const api=load('src/preview-gateway.ts',{__crypto:{subtle:{importKey:async()=>({}),verify:async()=>{verifies++;return true}}}})
  const env={FASTLINK_PREVIEW_STATUS:'OWNER_APPROVED',FASTLINK_PREVIEW_ORIGIN:'https://preview.example.test',FASTLINK_BACKEND_ORIGIN:'https://backend.example.test',
   FASTLINK_BUILD_SHA:'0'.repeat(40),FASTLINK_SOURCE_SNAPSHOT:'1'.repeat(64),FASTLINK_CANDIDATE_ID:'FL-LAUNCH-B13-20261017',
   FASTLINK_PREVIEW_EXPIRES_AT:new Date(Date.now()+60000).toISOString(),FASTLINK_PREVIEW_GATEWAY_PROOF:'B13_TEST_ONLY_NO_VALID_SECRET_00000000000000000000000000000',
   FASTLINK_PREVIEW_ACCESS_ISSUER:'https://synthetic.cloudflareaccess.com',FASTLINK_PREVIEW_ACCESS_AUDIENCE:'b13-fixture-audience',
   FASTLINK_PREVIEW_ALLOWED_EMAILS_JSON:JSON.stringify(['synthetic@example.test'])}
  const key={kid:'fixture',kty:'RSA',alg:'RS256',use:'sig',n:'synthetic_public_modulus',e:'AQAB'}
  const base={iss:env.FASTLINK_PREVIEW_ACCESS_ISSUER,aud:['b13-fixture-audience'],email:'synthetic@example.test',exp:Math.floor(Date.now()/1000)+60}
  for(const delta of [{iss:'https://wrong.example.test'},{aud:['wrong']},{exp:0},{email:'other@example.test'},{nbf:Date.now()/1000+3600}]){
   const token=Buffer.from(JSON.stringify({alg:'RS256',kid:'fixture'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({...base,...delta})).toString('base64url')+'.Tk9UX1JFQUw'
   await assert.rejects(api.previewAccess(new Request('https://preview.example.test/api/v1/cards',{headers:{'cf-access-jwt-assertion':token}}),{...env,FASTLINK_PREVIEW_ACCESS_JWKS_JSON:JSON.stringify({keys:[key]})}))
  }
  const token=Buffer.from(JSON.stringify({alg:'RS256',kid:'fixture'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(base)).toString('base64url')+'.Tk9UX1JFQUw'
  await assert.rejects(api.previewAccess(new Request('https://preview.example.test/api/v1/cards',{headers:{'cf-access-jwt-assertion':token}}),{...env,FASTLINK_PREVIEW_ACCESS_JWKS_JSON:JSON.stringify({keys:[{...key,d:'NOT_A_PRIVATE_KEY'}]})}))
  assert.equal(verifies,0)
 })

 if(fs.existsSync(path.join(root,'src/buildIdentity.ts'))){
  const {resolveBuildIdentity}=load('src/buildIdentity.ts')
  await check('Admin bound base/snapshot separate from deployment, conflict refused',()=>{
   const commit='0'.repeat(40),snapshot='1'.repeat(64)
   const v=resolveBuildIdentity({buildSha:commit,candidateId:'FL-LAUNCH-B13-20261017',sourceSnapshot:snapshot})
   assert.equal(v.sourceCommit,commit);assert.equal(v.sourceSnapshot,snapshot);assert.ok(v.displayLabel.includes('Release: UNBOUND'))
   assert.throws(()=>resolveBuildIdentity({buildSha:commit,runtimeBuildSha:'2'.repeat(40),candidateId:'FL-LAUNCH-B13-20261017',sourceSnapshot:snapshot}),/Conflicting/)
  })
  await check('real SupportCasePanel offline render disables mutations in preview',()=>{
   const {SupportCasePanel}=load('src/SupportCasePanel.tsx',{'./runtimeConfig':{runtimeConfig:{previewReadOnly:true}},'./productionApi':{ApiError:class{},productionApi:{},DEFAULT_API:'/api'},'./launchReadOnlyContract':{parseSupportReference:()=>({})},'./supportCaseContract':{}})
   const React=require('react'),server=require('react-dom/server')
   const session={accessToken:'B13_TEST_ONLY_NOT_A_VALID_SESSION',expiresAt:new Date(Date.now()+60000).toISOString(),user:{id:'fixture',tenantId:'tenant_a',environment:'TEST',permissions:['support:cases:read','support:cases:create','support:cases:manage']}}
   const html=server.renderToStaticMarkup(React.createElement(SupportCasePanel,{session,reference:'fixture',scope:'fixture',invalidateSession:()=>{}}))
   assert.match(html,/<button disabled=""[^>]*>创建客服工单<\/button>/)
   assert.match(html,/<button>查询客服工单<\/button>/)
  })
  await check('readonly UI and actual public metadata keep business mutations disabled',()=>{
   const support=fs.readFileSync(path.join(root,'src/SupportCasePanel.tsx'),'utf8'),users=fs.readFileSync(path.join(root,'src/B10Users.tsx'),'utf8')
   assert.ok(support.includes("!runtimeConfig.previewReadOnly || action === 'read'"))
   assert.ok(users.includes('runtimeConfig.previewReadOnly || !selected'));assert.ok(users.includes('review&&!runtimeConfig.previewReadOnly&&<fieldset'))
   const win={};vm.runInNewContext(fs.readFileSync(path.join(root,'public/runtime-config.js'),'utf8'),{window:win,Object});assert.equal(win.__FASTLINK_RUNTIME__.apiUrl,'/api');assert.equal(win.__FASTLINK_RUNTIME__.buildSha,undefined)
  })
 }else{
  await check('Wallet keeps login-only UI and truthful card navigation',()=>{
   const auth=fs.readFileSync(path.join(root,'src/routes/auth.tsx'),'utf8'),home=fs.readFileSync(path.join(root,'src/routes/index.tsx'),'utf8')
   assert.ok(auth.includes('(["login"] as const)'));assert.ok(!home.includes('cardTotals'))
   assert.ok(home.includes('查看卡状态')||home.includes('View Card State'))
  })
 }
 console.log('LIMITED Access real signed-JWT positive runtime remains NOT_BOUND; no key generation or external Access test')
}
console.log(JSON.stringify({status:'PASS_OFFLINE_ONLY',checks:pass,scope:'new B13 branches only, no old tests, no live signature/DB/browser claim'}))
