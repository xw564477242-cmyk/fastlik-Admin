export const DEFAULT_API = 'https://exquisite-surprise-production-309d.up.railway.app/api'

export type DataSource = 'MOCK' | 'LOCAL' | 'SANDBOX' | 'UAT' | 'PRODUCTION'
export type Health = {status:string;service:string;release:string;checks:{process?:string;database?:string;schema?:string};responseTimeMs?:number;timestamp:string}
export type AdminSession = {accessToken:string;tokenType:'Bearer';expiresInSeconds:number;expiresAt:string;user:{id:string;email:string;tenantId:string;environment:DataSource;roles:string[];permissions:string[]}}
export type Tenant = {id:string;legalName:string;brandName:string;slug:string;status:string;environment:DataSource}
export type TrialBalance = {assetCode:string;debit:string;credit:string;balanced:boolean}
export type TreasuryPosition = {assetCode:string;sponsorReserve:string;requiredReserve:string;availableBalance:string;authorizationHold:string;pendingSettlement:string;totalControlled?:string;liquidityRatio:string|null;updatedAt?:string}
export type Reconciliation = {
 generatedAt:string;dataSource:string;evidencePresent:boolean
 status:'MATCHED'|'DISCREPANCY'|'NO_DATA'
 pendingChecks:Array<{assetCode:string;expectedPendingSettlement:string;treasuryPendingSettlement:string;difference:string;matched:boolean}>
 authorizationHoldChecks:Array<{assetCode:string;expectedAuthorizationHold:string;treasuryAuthorizationHold:string;difference:string;matched:boolean}>
 clearingDifferenceChecks:Array<{assetCode:string;clearingDifference:string;expectedAuthorizationHold:string;matched:boolean}>
 journalChecks:Array<{assetCode:string;debit:string;credit:string;matched:boolean}>
 trialBalance:TrialBalance[]
 externalReconciliation:{bank:{status:'BLOCKED';blocker:string};processor:{status:'BLOCKED';blocker:string}}
}
export type Contamination = {tenantId:string;environment:string;dataSource:string;status:'CLEAN'|'CONTAMINATED';total:number;counts:Record<string,number>;generatedAt:string}
export type WalletAccount = {id:string;accountCode:string;name:string;customerId?:string;assetCode:string;purpose:string;status:string;postedBalance:string;pendingBalance:string}
export type Journal = {id:string;referenceType:string;referenceId?:string;idempotencyKey:string;description:string;status:string;postedAt:string;entries:Array<{id:string;walletAccountId:string;side:'DEBIT'|'CREDIT';amount:string;assetCode:string;memo?:string}>}
export type Merchant = {id:string;externalMerchantId:string;name:string;mcc:string;settlementAssetCode:string;status:string;createdAt:string}
export type MerchantPayment = {id:string;merchantId:string;walletAccountId:string;cardId?:string;status:string;assetCode:string;amount:string;journalIds:string[];settlementBatchId?:string;createdAt:string;merchant?:Merchant}
export type Page<T> = {data:T[];total:number;limit:number;offset:number}
export type TraceReport = {
 traceId:string;tenantId:string;environment:string;dataSource:string;generatedAt:string;status:'CONSISTENT'|'DISCREPANCY';operationalStatus:'READY'|'BLOCKED'
 externalEvidenceRequirements:Array<{provider:string;classification:string;status:'BLOCKED';blocker:string}>
 checks:{journalBalanced:boolean;trialBalanceBalanced:boolean;webhookFinanciallyPosted:boolean;auditPresent:boolean}
 summary:Record<string,number>
 customers:Array<Record<string,unknown>>;wallets:Array<Record<string,unknown>>;cards:Array<Record<string,unknown>>
 cardTransactions:Array<Record<string,unknown>>;walletOperations:Array<Record<string,unknown>>
 merchantPayments:Array<Record<string,unknown>>;merchants:Array<Record<string,unknown>>
 journals:Array<Record<string,unknown>>;treasury:Array<Record<string,unknown>>;settlements:Array<Record<string,unknown>>
 webhooks:Array<Record<string,unknown>>;audits:Array<Record<string,unknown>>;trialBalance:TrialBalance[]
}
export type IntegrationReadiness={
 status:'PASS'|'BLOCKED';externalUatEntryStatus:'PASS'|'BLOCKED';generatedAt:string
 providers:Record<string,{target:string;classification:string;status:'PASS'|'BLOCKED';configurationStatus:'PASS'|'BLOCKED';verificationStatus:'PASS'|'BLOCKED';checks:Array<{key:string;status:'PASS'|'BLOCKED';reason?:string}>}>
 releaseGate:Record<string,'PASS'|'BLOCKED'>;disclosure:string
 certificateMetadata:{transport:CertificateMetadata;signing:CertificateMetadata}
}
export type CertificateMetadata={configured:boolean;status:'PASS'|'FAIL'|'BLOCKED';validFrom?:string;validTo?:string;fingerprint256?:string;reason?:string}
export type CardRecord={id:string;customerId:string;environment:DataSource;provider:string;providerPublicToken:string;type:string;status:string;maskedPan?:string;last4?:string;expiryMonth?:number;expiryYear?:number;currency:string;alias?:string;balance?:{availableBalanceMinor:string;currentBalanceMinor:string;pendingAmountMinor:string;currency:string;updatedAt:string};holder?:Record<string,unknown>}
export type TransactionDetail={id:string;providerTransactionId:string;cardTransactionId:string;cardId:string;lifecycleId?:string;typeCode?:string;typeDescription?:string;statusCode?:string;statusDescription?:string;occurredAt?:string;stan?:string;rrn?:string;authorisationCode?:string;cardNetwork?:string;networkReference?:string;responseSource?:string;responseReason?:string;amount?:Record<string,unknown>;fees:Array<Record<string,unknown>>;merchant?:Record<string,unknown>;pos?:Record<string,unknown>;iso8583?:Record<string,unknown>;avs?:Record<string,unknown>;security?:Record<string,unknown>;settlements:Array<Record<string,unknown>>;lifecycle:Array<Record<string,unknown>>;audits:Array<Record<string,unknown>>;card:Record<string,unknown>}
export type EvidenceSummary={
 generatedAt:string;dataSource:string;status:'PASS'|'BLOCKED';artifactCount:number;immutable:true
 categories:Array<{
  category:string;status:'PASS'|'BLOCKED';missing:string[]
  operations:Array<{operation:string;evidence:null|{result:'PASS'|'FAIL'|'BLOCKED';capturedAt:string;contentHash:string}}>
 }>
}
export type FinancialOperationalReport={reportType:'FINANCIAL_OPERATIONAL_REPORT';generatedAt:string;businessDate:string;dataSource:string;status:'PASS'|'BLOCKED';internalFinancialStatus:'PASS'|'BLOCKED';externalReconciliationStatus:'PASS'|'BLOCKED';activity:Record<string,number>;blockers:string[]}

async function request<T>(base:string,path:string,token?:string,method='GET',body?:unknown):Promise<T>{
 const controller=new AbortController()
 const timeout=window.setTimeout(()=>controller.abort(),20_000)
 try{
  const response=await fetch(`${base.replace(/\/$/,'')}${path}`,{
   mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,
   method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
  })
  if(!response.ok){
   let message=`API ${response.status}`
   try{const body=await response.json();message=body.detail||(Array.isArray(body.message)?body.message.join(', '):(body.message||message))}catch{}
   const requestId=response.headers.get('x-request-id')
   throw new Error(`${message} · ${response.status} ${path}${requestId?` · Trace ${requestId}`:''}`)
  }
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof DOMException&&error.name==='AbortError')throw new Error(`API timeout · ${path}`)
  throw error
 }finally{window.clearTimeout(timeout)}
}

const query=(environment:DataSource)=>`environment=${encodeURIComponent(environment)}`
const filters=(values:Record<string,string|number|undefined>)=>new URLSearchParams(Object.entries(values).filter((entry):entry is [string,string|number]=>entry[1]!==undefined&&entry[1]!=='' ).map(([key,value])=>[key,String(value)])).toString()

export const productionApi={
 health:(base:string)=>request<Health>(base,'/health'),
 systemReadiness:(base:string)=>request<Health>(base,'/health/readiness'),
 login:(base:string,tenantId:string,email:string,password:string)=>request<AdminSession>(base,'/admin/auth/login',undefined,'POST',{tenantId,email,password}),
 logout:(base:string,token:string)=>request<{revoked:true}>(base,'/admin/auth/logout',token,'POST'),
 tenant:(base:string,token:string,tenantId:string)=>request<Tenant>(base,`/admin/tenants/${tenantId}`,token),
 readiness:(base:string,token:string,tenantId:string)=>request<IntegrationReadiness>(base,`/admin/tenants/${tenantId}/integrations/readiness`,token),
 treasury:(base:string,key:string,tenantId:string,environment:DataSource)=>request<{generatedAt:string;positions:TreasuryPosition[]}>(base,`/admin/tenants/${tenantId}/dashboards/treasury?${query(environment)}`,key),
 reconciliation:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Reconciliation>(base,`/admin/tenants/${tenantId}/settlement/reconciliation?${query(environment)}`,key),
 trialBalance:(base:string,key:string,tenantId:string,environment:DataSource)=>request<TrialBalance[]>(base,`/admin/tenants/${tenantId}/ledger/trial-balance?${query(environment)}`,key),
 accounts:(base:string,key:string,tenantId:string,environment:DataSource)=>request<WalletAccount[]>(base,`/admin/tenants/${tenantId}/ledger/accounts?${query(environment)}`,key),
 journals:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Journal[]>(base,`/admin/tenants/${tenantId}/ledger/journals?${query(environment)}`,key),
 contamination:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Contamination>(base,`/admin/tenants/${tenantId}/operations/mock-contamination?${query(environment)}`,key),
 merchants:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Page<Merchant>>(base,`/admin/tenants/${tenantId}/merchants?${query(environment)}&limit=100`,key),
 merchantPayments:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Page<MerchantPayment>>(base,`/admin/tenants/${tenantId}/merchant/payments?${query(environment)}&limit=100`,key),
 trace:(base:string,key:string,tenantId:string,environment:DataSource,traceId:string)=>request<TraceReport>(base,`/admin/tenants/${tenantId}/operations/traces/${encodeURIComponent(traceId)}?${query(environment)}`,key),
 evidenceSummary:(base:string,token:string,tenantId:string,environment:DataSource)=>request<EvidenceSummary>(base,`/admin/tenants/${tenantId}/evidence/summary?${query(environment)}`,token),
 dailyClosing:(base:string,token:string,tenantId:string,environment:DataSource)=>request<FinancialOperationalReport>(base,`/admin/tenants/${tenantId}/settlement/daily-closing?${query(environment)}`,token),
 cards:(base:string,token:string,tenantId:string,input:Record<string,string|number|undefined>={})=>request<Page<CardRecord>>(base,`/admin/tenants/${tenantId}/cards?${filters({...input,limit:100})}`,token),
 transactions:(base:string,token:string,tenantId:string,input:Record<string,string|number|undefined>={})=>request<Page<TransactionDetail>>(base,`/admin/tenants/${tenantId}/transactions?${filters({...input,limit:100})}`,token),
 cardTimeline:(base:string,token:string,tenantId:string,cardId:string)=>request<Array<Record<string,unknown>>>(base,`/admin/tenants/${tenantId}/cards/${encodeURIComponent(cardId)}/timeline`,token),
 cardAction:(base:string,token:string,tenantId:string,cardId:string,action:'freeze'|'unfreeze',idempotencyKey:string)=>request<CardRecord>(base,`/admin/tenants/${tenantId}/cards/${encodeURIComponent(cardId)}/${action}`,token,'POST',{idempotencyKey}),
}
