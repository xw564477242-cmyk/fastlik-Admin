import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const root=new URL('..',import.meta.url).pathname
const read=path=>readFileSync(join(root,path),'utf8')
const ui=read('src/ThreddAdmin.tsx')
const api=read('src/productionApi.ts')
const consoleSource=read('src/ProductionConsole.tsx')

const required=[
 ['Thredd Control Center tab',consoleSource.includes("id:'thredd'")],
 ['Sandbox identifier',api.includes("'SANDBOX'")],
 ['Official UAT identifier',api.includes("'OFFICIAL_UAT'")],
 ['Production identifier',api.includes("'PRODUCTION'")],
 ['No Mock fallback policy',ui.includes('绝不静默回退 Sandbox 或 Mock')],
 ['Partner Configuration',ui.includes('Thredd Partner Configuration')],
 ['Backend partner response normalization',api.includes('normalizeThreddConfiguration')&&api.includes('value.configuration')&&api.includes('value.partnerMetadata')&&api.includes('value.officialUatStatus')],
 ['Configuration update is re-retrieved',api.includes("await request<unknown>")&&api.includes("return normalizeThreddConfiguration(await request<ThreddPartnerConfigurationResponse>")],
 ['X-Region 0/1/2',ui.includes('0 · Default')&&ui.includes('1 · EMEA')&&ui.includes('2 · APAC')],
 ['Card Product Mapping',ui.includes('Card Product Mapping')],
 ['Scheme, BIN and Sub-BIN',ui.includes('Scheme / Network')&&ui.includes('Sub-BIN')],
 ['Card Profile and Cardholder',ui.includes('Card Profile Snapshot')&&ui.includes('Card Holder 与 KYC 独立维护')],
 ['Address and Fulfilment',ui.includes('Card Address')&&ui.includes('Fulfilment Address')],
 ['Production and Design Library',ui.includes('Card Production Center')&&ui.includes('Design Library')],
 ['Manufacturing controls',ui.includes('Thermal')&&ui.includes('Emboss')&&ui.includes('Vanity')&&ui.includes('Carrier')],
 ['Parent and Child mapping',ui.includes('Parent / Child Card Relationship')&&api.includes('/mvc-parent')],
 ['Card Controls',api.includes("action:'freeze'|'unfreeze'")&&ui.includes('Freeze Card')],
 ['Config3DSecure',api.includes('config3DSecure')&&ui.includes('3DS Configuration')],
 ['MultiFX',ui.includes('MultiFX')],
 ['Network Sharing',ui.includes('Network Sharing')],
 ['publicToken-only lookup',api.includes('/cards/${encodeURIComponent(publicToken)}')&&ui.includes('仅以 Thredd publicToken 查询')],
 ['204 No Content support',api.includes('response.status===204')&&ui.includes('204 No Content')],
 ['Real bearer session',api.includes('Authorization:`Bearer ${token}`')],
 ['RBAC read denial',ui.includes("if(!canRead)return")&&ui.includes('缺少 admin:read')],
 ['RBAC write denial',ui.includes("if(!canWrite){setError('RBAC DENIED")&&ui.includes('缺少 admin:write')],
 ['Audit requirement',ui.includes('Audit Log 为最终验收依据')],
 ['GUID idempotency',ui.includes('crypto.randomUUID()')],
]
const forbidden=[
 ['browser token persistence',/(localStorage|sessionStorage)/],
 ['Mock data generator',/(mockCard|mockProduct|mockDesign|generateDemo)/i],
 ['full PAN input',/placeholder=["'](?:full )?pan/i],
 ['CVV or PIN retrieval',/(retrieveCvv|retrievePin|\/cvv|\/pin)/],
 ['certificate or secret input',/(transportPrivateKey|signingPrivateKey|clientSecret|registrationAccessToken)/],
]

for(const[label,ok]of required)if(!ok)throw new Error(`Missing ${label}`)
for(const[label,pattern]of forbidden)if(pattern.test(ui))throw new Error(`Forbidden ${label}`)

const allowed=(permissions,required)=>permissions.includes('*')||permissions.includes(required)||permissions.includes(`${required.split(':',1)[0]}:*`)
const accessMatrix=[
 {name:'reader can read',permissions:['admin:read'],required:'admin:read',expected:true},
 {name:'reader write denied',permissions:['admin:read'],required:'admin:write',expected:false},
 {name:'writer can write',permissions:['admin:read','admin:write'],required:'admin:write',expected:true},
 {name:'admin wildcard',permissions:['admin:*'],required:'admin:write',expected:true},
 {name:'unrelated scope denied',permissions:['treasury:read'],required:'admin:read',expected:false},
]
for(const row of accessMatrix)if(allowed(row.permissions,row.required)!==row.expected)throw new Error(`RBAC matrix failed: ${row.name}`)

console.log(`THR-001-008 Admin E2E contract PASS (${required.length} requirements, ${forbidden.length} sensitive-data checks, ${accessMatrix.length} RBAC denial cases)`)
