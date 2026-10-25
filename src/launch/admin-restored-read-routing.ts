// Product wiring only. Business authentication, permissions, RLS and column ACL remain authoritative.
const tenant = '/admin/tenants/b9_tenant_A_20261016'
const objectId = '[A-Za-z0-9_-]{2,128}'
const reads: ReadonlyArray<{path: RegExp; keys: readonly string[]; environment?: true}> = [
 {path:new RegExp('^'+tenant+'$'), keys:[]},
 {path:new RegExp('^'+tenant+'/ledger/(accounts|journals|trial-balance)$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/settlement/(liquidity|reconciliation|trial-balance|daily-closing)$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/transactions$'),keys:['environment','limit'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/operations$'),keys:['environment','status','type','assetCode','limit','offset'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/operations/'+objectId+'$'),keys:['environment'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/accounts/'+objectId+'/history$'),keys:['environment','status','type','assetCode','limit','offset'],environment:true},
 {path:new RegExp('^'+tenant+'/wallet/asset-summary$'),keys:['environment','customerId'],environment:true},
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
  if(key==='customerId'&&!/^[A-Za-z0-9_-]{2,100}$/.test(value))return false
 }
 return !route.environment||seen.has('environment')
}
