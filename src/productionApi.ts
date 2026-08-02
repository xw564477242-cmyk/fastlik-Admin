import { runtimeConfig } from './runtimeConfig'
import { adminRoutes, type AdminCardTransactionQuery, type AdminWalletOperationQuery, type DataSource } from './adminRoutes'
import { MAX_CARD_WORKSPACE_JSON_BYTES } from './cardWorkspaceContract'
import { MAX_CARD_TRANSACTION_JSON_BYTES } from './cardTransactionContract'
import { MAX_ADMIN_CARD_TIMELINE_JSON_BYTES } from './cardTimelineContract'
import { MAX_TREASURY_RECONCILIATION_JSON_BYTES } from './treasuryReconciliationContract'
import { MAX_WALLET_OPERATION_LIST_JSON_BYTES } from './walletOperationListContract'
import { adminKycPath, MAX_ADMIN_KYC_JSON_BYTES, parseAdminKycResponse, type AdminKycEnvironment, type AdminKycRecord } from './adminKycContract'

export const DEFAULT_API = runtimeConfig.apiUrl
export type { DataSource } from './adminRoutes'
export type ThreddConfiguration = {status:'READY'|'BLOCKED';reason?:string;mode:string;missingVariables?:string[]}
export type Health = {
 status:string;service:string;environment?:string;release:string
 checks:{process?:string;database?:string;schema?:string;threddConfiguration?:string}
 responseTimeMs?:number;timestamp:string;threddConfigurationStatus?:ThreddConfiguration
}
export type AdminSession = {accessToken:string;tokenType:'Bearer';expiresInSeconds:number;expiresAt:string;user:{id:string;email:string;tenantId:string;environment:'SANDBOX'|'TEST'|'UAT'|'PRODUCTION';roles:string[];permissions:string[]}}
export type Tenant = {id:string;legalName:string;brandName:string;slug:string;status:string;environment:'SANDBOX'|'TEST'|'UAT'|'PRODUCTION'}
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

type ApiResponsePolicy =
 | Readonly<{format:'json'}>
 | Readonly<{format:'bounded-text';maxBytes:number}>

const jsonResponsePolicy:ApiResponsePolicy={format:'json'}

const readBoundedResponseText=async(response:Response,maxBytes:number):Promise<string>=>{
 const contentLength=response.headers.get('content-length')
 if(contentLength!==null){
  const declaredBytes=Number(contentLength)
  if(Number.isFinite(declaredBytes)&&declaredBytes>maxBytes)throw new Error('API response exceeds the allowed size')
 }
 if(!response.body){
  const text=await response.text()
  if(new TextEncoder().encode(text).byteLength>maxBytes)throw new Error('API response exceeds the allowed size')
  return text
 }
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let totalBytes=0
 try{
  for(;;){
   const {done,value}=await reader.read()
   if(done)break
   if(!value)continue
   totalBytes+=value.byteLength
   if(totalBytes>maxBytes){await reader.cancel();throw new Error('API response exceeds the allowed size')}
   chunks.push(value)
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(totalBytes);let offset=0
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes)
}

export async function apiRequest<T>(path:string,token?:string,method='GET',body?:unknown,responsePolicy:ApiResponsePolicy=jsonResponsePolicy,externalSignal?:AbortSignal):Promise<T>{
 const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),20_000);const trace=newTrace()
 const abortFromCaller=()=>controller.abort()
 if(externalSignal?.aborted)controller.abort()
 else externalSignal?.addEventListener('abort',abortFromCaller,{once:true})
 try{
  const response=await fetch(`${DEFAULT_API}${path}`,{
   mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,method,
   headers:{Accept:'application/json','X-Trace-Id':trace,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  })
  const returned=response.headers.get('x-trace-id')||trace
  if(!response.ok){
   let message=`API ${response.status}`
   try{
    const payload=responsePolicy.format==='bounded-text'
     ? JSON.parse(await readBoundedResponseText(response,responsePolicy.maxBytes))
     : await response.json()
    message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)
   }catch{}
   throw new ApiError(response.status,path,returned,`${message} · HTTP ${response.status} · Trace ${returned}`)
  }
  if(responsePolicy.format==='bounded-text')return await readBoundedResponseText(response,responsePolicy.maxBytes) as T
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof ApiError)throw error
  if(error instanceof DOMException&&error.name==='AbortError'){
   if(externalSignal?.aborted)throw new ApiError(499,path,trace,`API request cancelled · HTTP 499 · Trace ${trace}`)
   throw new ApiError(408,path,trace,`API timeout · HTTP 408 · Trace ${trace}`)
  }
  const message=error instanceof Error?error.message:'Network failure'
  throw new ApiError(0,path,trace,`${message} · HTTP 0 · Trace ${trace}`)
 }finally{window.clearTimeout(timeout);externalSignal?.removeEventListener('abort',abortFromCaller)}
}

async function health(path:string):Promise<Health>{
 const raw=await apiRequest<RawHealth>(path)
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
 login:(_base:string,tenantId:string,email:string,password:string)=>apiRequest<AdminSession>('/admin/auth/login',undefined,'POST',{tenantId,email,password}),
 logout:(_base:string,token:string)=>apiRequest<{revoked:true}>('/admin/auth/logout',token,'POST'),
 me:(_base:string,token:string)=>apiRequest<Record<string,unknown>>('/admin/auth/me',token),
 tenants:(_base:string,token:string)=>apiRequest<Tenant[]>('/admin/tenants',token),
 tenant:(_base:string,token:string,tenantId:string)=>apiRequest<Tenant>(adminRoutes.tenant(tenantId),token),
 readiness:(_base:string,token:string,tenantId:string)=>apiRequest<IntegrationReadiness>(adminRoutes.readiness(tenantId),token),
 treasury:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<{generatedAt:string;positions:TreasuryPosition[]}>(`/admin/tenants/${tenantId}/dashboards/treasury?${query(environment)}`,key),
 settlementDashboard:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Record<string,unknown>>(`/admin/tenants/${tenantId}/dashboards/settlement?${query(environment)}`,key),
 riskDashboard:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Record<string,unknown>>(`/admin/tenants/${tenantId}/dashboards/risk?${query(environment)}`,key),
 reconciliation:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Reconciliation>(`/admin/tenants/${tenantId}/settlement/reconciliation?${query(environment)}`,key),
 trialBalance:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<TrialBalance[]>(`/admin/tenants/${tenantId}/ledger/trial-balance?${query(environment)}`,key),
 treasuryLiquidity:(_base:string,key:string,tenantId:string,environment:Extract<DataSource,'SANDBOX'|'TEST'>,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.treasuryLiquidity(tenantId,environment),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_TREASURY_RECONCILIATION_JSON_BYTES},signal),
 treasuryReconciliation:(_base:string,key:string,tenantId:string,environment:Extract<DataSource,'SANDBOX'|'TEST'>,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.treasuryReconciliation(tenantId,environment),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_TREASURY_RECONCILIATION_JSON_BYTES},signal),
 treasuryTrialBalance:(_base:string,key:string,tenantId:string,environment:Extract<DataSource,'SANDBOX'|'TEST'>,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.treasuryTrialBalance(tenantId,environment),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_TREASURY_RECONCILIATION_JSON_BYTES},signal),
 treasuryDailyClosing:(_base:string,key:string,tenantId:string,environment:Extract<DataSource,'SANDBOX'|'TEST'>,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.treasuryDailyClosing(tenantId,environment),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_TREASURY_RECONCILIATION_JSON_BYTES},signal),
 accounts:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<WalletAccount[]>(`/admin/tenants/${tenantId}/ledger/accounts?${query(environment)}`,key),
 journals:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Journal[]>(`/admin/tenants/${tenantId}/ledger/journals?${query(environment)}`,key),
 walletOperations:(_base:string,key:string,tenantId:string,environment:Extract<DataSource,'SANDBOX'|'TEST'>,query:AdminWalletOperationQuery,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.walletOperations(tenantId,environment,query),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_WALLET_OPERATION_LIST_JSON_BYTES},signal),
 walletTransactions:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<unknown>(adminRoutes.walletTransactions(tenantId,environment),key),
 walletOperation:(_base:string,key:string,tenantId:string,operationId:string,environment:DataSource)=>apiRequest<unknown>(adminRoutes.walletOperation(tenantId,operationId,environment),key),
 contamination:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Contamination>(`/admin/tenants/${tenantId}/operations/mock-contamination?${query(environment)}`,key),
 merchants:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Page<Merchant>>(`/admin/tenants/${tenantId}/merchants?${query(environment)}&limit=100`,key),
 merchantPayments:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<Page<MerchantPayment>>(`/admin/tenants/${tenantId}/merchant/payments?${query(environment)}&limit=100`,key),
 apiClients:(_base:string,key:string,tenantId:string)=>apiRequest<unknown>(`/admin/tenants/${tenantId}/api-clients`,key),
 events:(_base:string,key:string,tenantId:string,environment:DataSource)=>apiRequest<unknown>(`/admin/tenants/${tenantId}/events?${query(environment)}`,key),
 adminKyc:async(_base:string,key:string,tenantId:string,environment:AdminKycEnvironment,userId:string,signal?:AbortSignal):Promise<AdminKycRecord>=>parseAdminKycResponse(await apiRequest<string>(adminKycPath(tenantId,userId,environment),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_ADMIN_KYC_JSON_BYTES},signal),userId),
 cardSnapshot:(_base:string,key:string,tenantId:string,cardId:string,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.cardSnapshot(tenantId,cardId),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_CARD_WORKSPACE_JSON_BYTES},signal),
 cardBalanceSnapshot:(_base:string,key:string,tenantId:string,cardId:string,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.cardBalanceSnapshot(tenantId,cardId),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_CARD_WORKSPACE_JSON_BYTES},signal),
 cardLimitsSnapshot:(_base:string,key:string,tenantId:string,cardId:string,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.cardLimitsSnapshot(tenantId,cardId),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_CARD_WORKSPACE_JSON_BYTES},signal),
 cardTimeline:(_base:string,key:string,tenantId:string,cardId:string,cursor?:string,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.cardTimeline(tenantId,cardId,cursor),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_ADMIN_CARD_TIMELINE_JSON_BYTES},signal),
 cardTransactions:(_base:string,key:string,tenantId:string,cardId:string,query:AdminCardTransactionQuery,cursor?:string,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.cardTransactions(tenantId,cardId,query,cursor),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_CARD_TRANSACTION_JSON_BYTES},signal),
 cardTransaction:(_base:string,key:string,tenantId:string,cardId:string,transactionId:string,signal?:AbortSignal)=>apiRequest<string>(adminRoutes.cardTransaction(tenantId,cardId,transactionId),key,'GET',undefined,{format:'bounded-text',maxBytes:MAX_CARD_TRANSACTION_JSON_BYTES},signal),
 freezeCard:(_base:string,key:string,tenantId:string,cardId:string)=>apiRequest<string>(adminRoutes.freezeCard(tenantId,cardId),key,'POST',{idempotencyKey:crypto.randomUUID()},{format:'bounded-text',maxBytes:MAX_CARD_WORKSPACE_JSON_BYTES}),
 unfreezeCard:(_base:string,key:string,tenantId:string,cardId:string)=>apiRequest<string>(adminRoutes.unfreezeCard(tenantId,cardId),key,'POST',{idempotencyKey:crypto.randomUUID()},{format:'bounded-text',maxBytes:MAX_CARD_WORKSPACE_JSON_BYTES}),
 trace:(_base:string,key:string,tenantId:string,environment:DataSource,id:string)=>apiRequest<TraceReport>(`/admin/tenants/${tenantId}/operations/traces/${encodeURIComponent(id)}?${query(environment)}`,key),
 evidence:(_base:string,token:string,tenantId:string,environment:DataSource)=>apiRequest<unknown>(`/admin/tenants/${tenantId}/evidence?${query(environment)}&limit=100`,token),
 evidenceSummary:(_base:string,token:string,tenantId:string,environment:DataSource)=>apiRequest<EvidenceSummary>(`/admin/tenants/${tenantId}/evidence/summary?${query(environment)}`,token),
 dailyClosing:(_base:string,token:string,tenantId:string,environment:DataSource)=>apiRequest<FinancialOperationalReport>(`/admin/tenants/${tenantId}/settlement/daily-closing?${query(environment)}`,token),
}
