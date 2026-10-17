import { previewRequestAllowed } from './launch/preview-readonly-policy'
export type PreviewEnv = Record<string, unknown>
function required(env: PreviewEnv,key: string): string {
 const v=env[key];if(typeof v!=='string'||!v.trim()||v.includes('NOT_BOUND'))throw Error('PREVIEW_UNBOUND');return v.trim()
}
export function previewBindings(env: PreviewEnv,origin: string) {
 if(required(env,'FASTLINK_PREVIEW_STATUS')!=='OWNER_APPROVED')throw Error('PREVIEW_UNBOUND')
 if(required(env,'FASTLINK_PREVIEW_ORIGIN')!==origin||!origin.startsWith('https://'))throw Error('PREVIEW_ORIGIN')
 const backend=required(env,'FASTLINK_BACKEND_ORIGIN')
 if(!backend.startsWith('https://')||new URL(backend).origin!==backend)throw Error('PREVIEW_BACKEND')
 const buildSha=required(env,'FASTLINK_BUILD_SHA'),snapshot=required(env,'FASTLINK_SOURCE_SNAPSHOT'),candidate=required(env,'FASTLINK_CANDIDATE_ID')
 if(!/^[0-9a-f]{40}$/i.test(buildSha)||!/^[0-9a-f]{64}$/.test(snapshot)||!/^FL-LAUNCH-B13-[0-9]{8}$/.test(candidate))throw Error('PREVIEW_VERSION')
 const expiry=Date.parse(required(env,'FASTLINK_PREVIEW_EXPIRES_AT'))
 if(!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+24*3600000)throw Error('PREVIEW_EXPIRED')
 const proof=required(env,'FASTLINK_PREVIEW_GATEWAY_PROOF')
 if(proof.length<48||proof.length>256)throw Error('PREVIEW_GATEWAY')
 const issuer=required(env,'FASTLINK_PREVIEW_ACCESS_ISSUER')
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))throw Error('PREVIEW_ACCESS')
 return {backend,buildSha,snapshot,candidate,proof,issuer,audience:required(env,'FASTLINK_PREVIEW_ACCESS_AUDIENCE')}
}
function jsonPart(value: string): Record<string, unknown> {
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('PREVIEW_ACCESS')
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4))
 const v=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))))
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('PREVIEW_ACCESS')
 return v
}
export async function previewAccess(request: Request,env: PreviewEnv) {
 const binding=previewBindings(env,new URL(request.url).origin)
 const jwt=request.headers.get('cf-access-jwt-assertion')
 if(!jwt||jwt.length>8192)throw Error('PREVIEW_ACCESS')
 const parts=jwt.split('.');if(parts.length!==3)throw Error('PREVIEW_ACCESS')
 const header=jsonPart(parts[0]),claims=jsonPart(parts[1])
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==binding.issuer
  ||!Array.isArray(claims.aud)||!claims.aud.includes(binding.audience)
  ||typeof claims.exp!=='number'||claims.exp<=Date.now()/1000
  ||(claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf>Date.now()/1000)))throw Error('PREVIEW_ACCESS')
 const emails=JSON.parse(required(env,'FASTLINK_PREVIEW_ALLOWED_EMAILS_JSON'))
 if(!Array.isArray(emails)||emails.length<1||emails.length>25||typeof claims.email!=='string'||!emails.includes(claims.email))throw Error('PREVIEW_ACCESS')
 const jwks=JSON.parse(required(env,'FASTLINK_PREVIEW_ACCESS_JWKS_JSON'))
 if(!jwks||!Array.isArray(jwks.keys)||jwks.keys.length<1||jwks.keys.length>8)throw Error('PREVIEW_ACCESS')
 const keys=jwks.keys.filter((k:Record<string,unknown>)=>k.kid===header.kid)
 if(keys.length!==1)throw Error('PREVIEW_ACCESS')
 const key=keys[0]
 if(key.kty!=='RSA'||key.alg!=='RS256'||key.use!=='sig'||['d','p','q','dp','dq','qi'].some(k=>key[k]!==undefined))throw Error('PREVIEW_ACCESS')
 const imported=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
 if(!/^[A-Za-z0-9_-]+$/.test(parts[2]))throw Error('PREVIEW_ACCESS')
 const raw=atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-parts[2].length%4)%4))
 const signature=Uint8Array.from(raw,c=>c.charCodeAt(0))
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',imported,signature,new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('PREVIEW_ACCESS')
 return binding
}
export function previewProxyHeaders(request:Request,proof:string) {
 const h=new Headers(request.headers)
 for(const key of ['host','forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-fastlink-preview-gateway','x-fastlink-api-proxy','cf-access-jwt-assertion'])h.delete(key)
 const cookie=h.get('cookie')
 if(cookie)h.set('cookie',cookie.split(';').filter(x=>x.trim().split('=',1)[0]!=='CF_Authorization').join(';'))
 h.set('x-fastlink-preview-gateway',proof);h.set('x-forwarded-host',new URL(request.url).host);h.set('x-forwarded-proto','https')
 return h
}
export async function previewProxy(request:Request,binding:ReturnType<typeof previewBindings>) {
 const u=new URL(request.url)
 if(!previewRequestAllowed(u.pathname+u.search,request.method))return new Response('Request unavailable',{status:403})
 const target=new URL(u.pathname+u.search,binding.backend)
 const response=await fetch(target,{method:request.method,headers:previewProxyHeaders(request,binding.proof),body:request.method==='GET'?undefined:request.body,redirect:'manual'})
 const h=new Headers(response.headers);h.set('cache-control','no-store');h.set('x-fastlink-source-commit',binding.buildSha);h.set('x-fastlink-source-snapshot',binding.snapshot);h.set('x-fastlink-candidate-id',binding.candidate)
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h})
}
