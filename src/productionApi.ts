import { runtimeConfig } from './runtimeConfig'

export const DEFAULT_API = runtimeConfig.apiUrl
export type DataSource = 'SANDBOX' | 'UAT' | 'PRODUCTION'
export type ThreddConfiguration = {status:'READY'|'BLOCKED';reason?:string;mode:string;missingVariables?:string[]}
export type Health = {
 status:string;service:string;environment?:string;release:string
 checks:{process?:string;database?:string;schema?:string;threddConfiguration?:string}
 responseTimeMs?:number;timestamp:string;threddConfigurationStatus?:ThreddConfiguration
}
export type AdminSession = {accessToken:string;tokenType:'Bearer';expiresInSeconds:number;expiresAt:string;user:{id:string;email:string;tenantId:string;environment:'SANDBOX'|'UAT'|'PRODUCTION';roles:string[];permissions:string[]}}
export type Tenant = {id:string;legalName:string;brandName:string;slug:string;status:string;environment:'SANDBOX'|'UAT'|'PRODUCTION'}
export type TrialBalance = {assetCode:string;debit:string;credit:string;balanced:boolean}
export type TreasuryPosition = {assetCode:string;sponsorReserve:string;requiredReserve:string;availableBalance:string;authorizationHold:string;pendingSettlement:string;totalControlled?:string;liquidityRatio:string|null;updatedAt?:string}
export type Reconciliation = {generatedAt:string;dataSource:string;evidencePresent:boolean;status:'MATCHED'|'DISCREPANCY'|'NO_DATA';pendingChecks:Array<{assetCode:string;expectedPendingSettlement:string;treasuryPendingSettlement:string;difference:string;matched:boolean}>;authorizationHoldChecks:Array<{assetCode:string;expectedAuthorizationHold:string;treasuryAuthorizationHold:string;difference:string;matched:boolean}>;clearingDifferenceChecks:Array<{assetCode:string;clearingDifference:string;expectedAuthorizationHold:string;matched:boolean}>;journalChecks:Array<{assetCode:string;debit:string;credit:string;matched:boolean}>;trialBalance:TrialBalance[];externalReconciliation:{bank:{status:'BLOCKED';blocker:string};processor:{status:'BLOCKED';blocker:string}}}
export type Contamination = {tenantId:string;environment:string;dataSource:string;status:'CLEAN'|'CONTAMINATED';total:number;counts:Record<string,number>;generatedAt:string}
export type WalletAccount = {id:string;accountCode:string;name:string;customerId?:string;assetCode:string;purpose:string;status:string;postedBalance:string;pendingBalance:string}
export type Journal = {id:string;referenceType:string;referenceId?:string;idempotencyKey:string;description:string;status:string;postedAt:string;entries:Array<{id:string;walletAccountId:string;side:'DEBIT'|'CREDIT';amount:string;assetCode:string;memo?:string}>}
export type Merchant = {id:string;externalMerchantId:string;name:string;mcc:string;settlementAssetCode:string;status:string;createdAt:string}
export type MerchantPayment = {id:string;merchantId:string;walletAccountId:string;cardId?:string;status:string;assetCode:string;amount:string;journalIds:string[];settlementBatchId?:string;createdAt:string;merchant?:Merchant}
export type Page<T> = {data:T[];total:number;limit:number;offset:number}
export type TraceReport = {traceId:string;tenantId:string;environment:string;dataSource:string;generatedAt:string;status:'CONSISTENT'|'DISCREPANCY';operationalStatus:'READY'|'BLOCKED';externalEvidenceRequirements:Array<{provider:string;classification:string;status:'BLOCKED';blocker:string}>;checks:{journalBalanced:boolean;trialBalanceBalanced:boolean;webhookFinanciallyPosted:boolean;auditPresent:boolean};summary:Record<string,number>;customers:Array<Record<string,unknown>>;wallets:Array<Record<string,unknown>>;cards:Array<Record<string,unknown>>;cardTransactions:Array<Record<string,unknown>>;walletOperations:Array<Record<string,unknown>>;merchantPayments:Array<Record<string,unknown>>;merchants:Array<Record<string,unknown>>;journals:Array<Record<string,unknown>>;treasury:Array<Record<string,unknown>>;settlements:Array<Record<string,unknown>>;webhooks:Array<Record<string,unknown>>;audits:Array<Record<string,unknown>>;trialBalance:TrialBalance[]}
export type IntegrationReadiness={status:'PASS'|'BLOCKED';externalUatEntryStatus:'READY'|'BLOCKED';generatedAt:string;providers:Record<string,{target:string;classification:string;status:'PASS'|'BLOCKED';configurationStatus:'PASS'|'BLOCKED';verificationStatus:'PASS'|'BLOCKED'}>;releaseGate:Record<string,'PASS'|'BLOCKED'>;disclosure:string}
export type EvidenceSummary={generatedAt:string;dataSource:string;status:'PASS'|'BLOCKED';artifactCount:number;immutable:true;categories:Array<{category:string;status:'PASS'|'BLOCKED';missing:string[];operations:Array<{operation:string;evidence:null|{result:'PASS'|'FAIL'|'BLOCKED';capturedAt:string;contentHash:string}}>}>}
export type FinancialOperationalReport={reportType:'FINANCIAL_OPERATIONAL_REPORT';generatedAt:string;businessDate:string;dataSource:string;status:'PASS'|'BLOCKED';internalFinancialStatus:'PASS'|'BLOCKED';externalReconciliationStatus:'PASS'|'BLOCKED';activity:Record<string,number>;blockers:string[]}

type RawHealth = {
 status:string;service:string;environment?:string;release?:string;releaseSha?:string
 checks?:{process?:string;database?:string;schema?:string;threddConfiguration?:string}
 databaseStatus?:string;schemaStatus?:string;threddConfigurationStatus?:ThreddConfiguration
 responseTimeMs?:number;timestamp:string
}

export class ApiError extends Error {
 constructor(public readonly status:number,public readonly path:string,public readonly traceId:string,message:string){super(message)}
}

const newTrace=()=>crypto.randomUUID()

async function request<T>(path:string,token?:string,method='GET',body?:unknown):Promise<T>{
 const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),20_000);const trace=newTrace()
 try{
  const response=await fetch(`${DEFAULT_API}${path}`,{
   mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,method,
   headers:{Accept:'application/json','X-Trace-Id':trace,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  })
  const returned=response.headers.get('x-trace-id')||trace
  if(!response.ok){
   let message=`API ${response.status}`
   try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}
   throw new ApiError(response.status,path,returned,`${message} · HTTP ${response.status} · Trace ${returned}`)
  }
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof ApiError)throw error
  if(error instanceof DOMException&&error.name==='AbortError')throw new ApiError(408,path,trace,`API timeout · HTTP 408 · Trace ${trace}`)
  const message=error instanceof Error?error.message:'Network failure'
  throw new ApiError(0,path,trace,`${message} · HTTP 0 · Trace ${trace}`)
 }finally{window.clearTimeout(timeout)}
}

async function health(path:string):Promise<Health>{
 const raw=await request<RawHealth>(path)
 const thredd=raw.threddConfigurationStatus
 return {
  status:raw.status,
  service:raw.service,
  environment:raw.environment,
  release:raw.releaseSha||raw.release||'unknown',
  checks:{
   process:raw.checks?.process,
   database:raw.databaseStatus||raw.checks?.database,
   schema:raw.schemaStatus||raw.checks?.schema,
   threddConfiguration:thredd?`${thredd.status}${thredd.reason?` · ${thredd.reason}`:''}`:raw.checks?.threddConfiguration,
  },
  responseTimeMs:raw.responseTimeMs,
  timestamp:raw.timestamp,
  threddConfigurationStatus:thredd,
 }
}

const query=(environment:DataSource)=>`environment=${encodeURIComponent(environment)}`
export const productionApi={
 health:(_base:string)=>health('/health'),
 systemReadiness:(_base:string)=>health('/health/readiness'),
 login:(_base:string,tenantId:string,email:string,password:string)=>request<AdminSession>('/admin/auth/login',undefined,'POST',{tenantId,email,password}),
 logout:(_base:string,token:string)=>request<{revoked:true}>('/admin/auth/logout',token,'POST'),
 tenant:(_base:string,token:string,tenantId:string)=>request<Tenant>(`/admin/tenants/${tenantId}`,token),
 readiness:(_base:string,token:string,tenantId:string)=>request<IntegrationReadiness>(`/admin/tenants/${tenantId}/integrations/readiness`,token),
 treasury:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<{generatedAt:string;positions:TreasuryPosition[]}>(`/admin/tenants/${tenantId}/dashboards/treasury?${query(environment)}`,key),
 reconciliation:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<Reconciliation>(`/admin/tenants/${tenantId}/settlement/reconciliation?${query(environment)}`,key),
 trialBalance:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<TrialBalance[]>(`/admin/tenants/${tenantId}/ledger/trial-balance?${query(environment)}`,key),
 accounts:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<WalletAccount[]>(`/admin/tenants/${tenantId}/ledger/accounts?${query(environment)}`,key),
 journals:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<Journal[]>(`/admin/tenants/${tenantId}/ledger/journals?${query(environment)}`,key),
 contamination:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<Contamination>(`/admin/tenants/${tenantId}/operations/mock-contamination?${query(environment)}`,key),
 merchants:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<Page<Merchant>>(`/admin/tenants/${tenantId}/merchants?${query(environment)}&limit=100`,key),
 merchantPayments:(_base:string,key:string,tenantId:string,environment:DataSource)=>request<Page<MerchantPayment>>(`/admin/tenants/${tenantId}/merchant/payments?${query(environment)}&limit=100`,key),
 trace:(_base:string,key:string,tenantId:string,environment:DataSource,id:string)=>request<TraceReport>(`/admin/tenants/${tenantId}/operations/traces/${encodeURIComponent(id)}?${query(environment)}`,key),
 evidenceSummary:(_base:string,token:string,tenantId:string,environment:DataSource)=>request<EvidenceSummary>(`/admin/tenants/${tenantId}/evidence/summary?${query(environment)}`,token),
 dailyClosing:(_base:string,token:string,tenantId:string,environment:DataSource)=>request<FinancialOperationalReport>(`/admin/tenants/${tenantId}/settlement/daily-closing?${query(environment)}`,token),
}
