// Product wiring only. Business authentication, permissions, RLS and column ACL remain authoritative.
const tenant = '/admin/tenants/b9_tenant_A_20261016'
const objectId = '[A-Za-z0-9_-]{2,128}'
const traceId = '[A-Za-z0-9._:-]{8,128}'
const reads: ReadonlyArray<{path: RegExp; keys: readonly string[]; environment?: true}> = [
 {path:new RegExp('^'+tenant+'$'), keys:[]},
 {path:new RegExp('^'+tenant+'/ledger/(accounts|journals|trial-balance)$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/settlement/(liquidity|reconciliation|trial-balance|daily-closing)$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/transactions$'),keys:['environment','type','status','assetCode','limit','offset'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/operations$'),keys:['environment','status','type','assetCode','limit','offset'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/operations/'+objectId+'$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/accounts/'+objectId+'/history$'),keys:['environment','status','type','assetCode','limit','offset'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/asset-summary$'),keys:['environment','customerId'],environment:true},
 {path:new RegExp('^'+tenant+'/dashboards/(treasury|settlement|risk)$'),keys:['environment','highValueThresholdMinor'],environment:true},
 {path:new RegExp('^'+tenant+'/integrations/readiness$'),keys:[]},
 {path:new RegExp('^'+tenant+'/(card-products|fee-policy|api-clients)$'),keys:[]},
 {path:new RegExp('^'+tenant+'/events$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/merchants$'),keys:['environment','limit','offset','search','status'],environment:true},
 {path:new RegExp('^'+tenant+'/merchants/'+objectId+'$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/merchant/payments$'),keys:['environment','limit','offset','merchantId','status','assetCode','from','to'],environment:true},
 {path:new RegExp('^'+tenant+'/merchant/payments/'+objectId+'$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/evidence$'),keys:['environment','limit','offset','category','result','operation','traceId'],environment:true},
 {path:new RegExp('^'+tenant+'/evidence/summary$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/operations/mock-contamination$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/support-cases$'),keys:['traceId']},
 {path:new RegExp('^'+tenant+'/support-cases/'+objectId+'$'),keys:[]},
 {path:new RegExp('^'+tenant+'/operations/card-support/'+traceId+'$'),keys:[]},
 {path:new RegExp('^'+tenant+'/users(?:/'+objectId+'(?:/kyc)?)?$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/cards/'+objectId+'/snapshot(?:/(?:balance|limits))?$'),keys:[]},
 {path:new RegExp('^'+tenant+'/cards/'+objectId+'/timeline$'),keys:['limit','cursor']},
 {path:new RegExp('^'+tenant+'/cards/'+objectId+'/transactions$'),keys:['limit','cursor','status','type','currency','from','to']},
 {path:new RegExp('^'+tenant+'/cards/'+objectId+'/transactions/'+objectId+'$'),keys:[]},
 {path:new RegExp('^'+tenant+'/operations/traces/'+traceId+'$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/treasury/funds-instructions/'+objectId+'$'),keys:['environment'],environment:true},
]
export function restoredAdminReadAllowed(target:string, method='GET'):boolean {
 if(method!=='GET'||typeof target!=='string'||target.length>4096||!/^[\x21-\x7e]+$/.test(target))return false
 const [path,query,extra]=target.split('?')
 if(extra!==undefined||/[%\\;#]/.test(path)||path.includes('//')||/\/(?:\.|\.\.)(?:\/|$)/.test(path))return false
 const route=reads.find(r=>r.path.test(path));if(!route)return false
 const seen=new Set<string>()
 for(const [key,value] of new URLSearchParams(query??'')){
  if(!route.keys.includes(key)||seen.has(key)||!value)return false;seen.add(key)
  if(key==='environment'&&value!=='TEST')return false
  if(key==='limit'&&!/^(?:[1-9][0-9]?|100)$/.test(value))return false
  if(key==='offset'&&!/^(?:0|[1-9][0-9]{0,8})$/.test(value))return false
  if(key==='assetCode'&&!/^[A-Z0-9]{2,12}$/.test(value))return false
  if((key==='type'||key==='status')&&!/^[A-Z][A-Z_]{1,39}$/.test(value))return false
  if((key==='customerId'||key==='merchantId')&&!/^[A-Za-z0-9_-]{2,100}$/.test(value))return false
  if(key==='search'&&(value.length>100||/[\x00-\x1f\x7f]/.test(value)))return false
  if((key==='category'||key==='result')&&!/^[A-Z][A-Z_]{1,39}$/.test(value))return false
  if(key==='operation'&&!/^[A-Za-z0-9._:-]{1,100}$/.test(value))return false
  if(key==='traceId'&&!/^[A-Za-z0-9._:-]{8,128}$/.test(value))return false
  if((key==='from'||key==='to')&&(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)||!Number.isFinite(Date.parse(value))))return false
  if(key==='highValueThresholdMinor'&&(!/^[1-9][0-9]{0,9}$/.test(value)||BigInt(value)>1_000_000_000n))return false
  if(key==='currency'&&!/^[A-Z]{3}$/.test(value))return false
  if(key==='cursor'&&!/^[A-Za-z0-9._-]{1,2048}$/.test(value))return false
 }
 return !route.environment||seen.has('environment')
}
