import {DEFAULT_API} from './treasuryApi'

export type Tenant={id:string;brandName:string;legalName:string;environment:'SANDBOX'|'PRODUCTION'}
export type WalletAccount={id:string;accountCode:string;name:string;customerId?:string;assetCode:string;postedBalance:string;pendingBalance:string}
export type TreasuryPosition={id:string;assetCode:string;sponsorReserve:string;requiredReserve:string;availableBalance:string;pendingSettlement:string;liquidityRatio:string|null;totalControlled:string}
export type WalletOperation={id:string;type:string;status:string;assetCode:string;amount:string;sourceAccountId?:string;destinationAccountId?:string;journalIds:string[];createdAt:string}
export type Journal={id:string;referenceType:string;referenceId?:string;description:string;postedAt:string;entries:Array<{id:string;walletAccountId:string;side:'DEBIT'|'CREDIT';amount:string;assetCode:string;memo?:string}>}
export type TrialBalance={assetCode:string;debit:string;credit:string;balanced:boolean}
export type SettlementDashboard={generatedAt:string;summary:{pendingCount:number;completedCount:number;failedCount:number;pendingByAsset:Record<string,string>;oldestPendingAt:string|null};positions:Array<{assetCode:string;availableBalance:string;pendingSettlement:string}>;withdrawals:Array<{id:string;status:string;amount:string;assetCode:string;journalIds:string[];createdAt:string;completedAt:string|null}>;journals:Journal[]}
export type RiskDashboard={generatedAt:string;summary:{transactionCount:number;declinedCount:number;declineRate:number;highValueCount:number;highValueThresholdMinor:string;frozenCards:number;openAlerts:number};alerts:Array<{type:string;severity:string;transactionId:string;cardId:string;amountMinor:string;currency:string;occurredAt:string}>}
export type SandboxCustomer={id:string;externalUserId:string;providerCustomerRef:string}
export type ProcessorCard={id:string;customerId:string;environment:string;provider:string;providerPublicToken:string;type:string;status:string;maskedPan?:string;last4?:string;expiryMonth?:number;expiryYear?:number;currency:string;alias?:string;balance?:ProcessorCardBalance|null}
export type ProcessorCardBalance={availableBalanceMinor:string;currentBalanceMinor:string;pendingAmountMinor:string;currency:string;updatedAt?:string}

const keyName='fastlink_admin_api_key'
export const getAdminKey=()=>sessionStorage.getItem(keyName)||''
export const setAdminKey=(value:string)=>value?sessionStorage.setItem(keyName,value):sessionStorage.removeItem(keyName)

async function adminRequest<T>(path:string,apiKey:string,init?:RequestInit):Promise<T>{
 try{
  const response=await fetch(`${DEFAULT_API}${path}`,{...init,headers:{'Content-Type':'application/json','x-admin-api-key':apiKey,...(init?.headers||{})}})
  if(!response.ok){let message=`API ${response.status}`;try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}const requestId=response.headers.get('x-request-id');throw new Error(`${message} · ${response.status} ${path}${requestId?` · ${requestId}`:''}`)}
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof TypeError)throw new Error(`无法连接 FastLink API（${DEFAULT_API}）：${error.message}`)
  throw error
 }
}

const body=(value:unknown):RequestInit=>({method:'POST',body:JSON.stringify(value)})
export const walletBusinessApi={
 tenants:(key:string)=>adminRequest<Tenant[]>('/admin/tenants',key),
 createSandboxTenant:(key:string,slug:string)=>adminRequest<Tenant>('/admin/tenants',key,body({legalName:'FastLink Sandbox',brandName:'FastLink Sandbox',slug,environment:'SANDBOX'})),
 accounts:(tenantId:string,key:string)=>adminRequest<WalletAccount[]>(`/admin/tenants/${tenantId}/ledger/accounts?environment=SANDBOX`,key),
 operations:(tenantId:string,key:string)=>adminRequest<WalletOperation[]>(`/admin/tenants/${tenantId}/wallet/operations?environment=SANDBOX`,key),
 treasury:(tenantId:string,key:string)=>adminRequest<TreasuryPosition[]>(`/admin/tenants/${tenantId}/wallet/treasury?environment=SANDBOX`,key),
 journals:(tenantId:string,key:string)=>adminRequest<Journal[]>(`/admin/tenants/${tenantId}/ledger/journals?environment=SANDBOX`,key),
 trialBalance:(tenantId:string,key:string)=>adminRequest<TrialBalance[]>(`/admin/tenants/${tenantId}/ledger/trial-balance?environment=SANDBOX`,key),
 settlementDashboard:(tenantId:string,key:string)=>adminRequest<SettlementDashboard>(`/admin/tenants/${tenantId}/dashboards/settlement?environment=SANDBOX`,key),
 riskDashboard:(tenantId:string,key:string)=>adminRequest<RiskDashboard>(`/admin/tenants/${tenantId}/dashboards/risk?environment=SANDBOX`,key),
 createCardCustomer:(tenantId:string,key:string,externalUserId:string)=>adminRequest<SandboxCustomer>(`/admin/tenants/${tenantId}/card-sandbox/customers`,key,body({externalUserId})),
 createProcessorCard:(tenantId:string,key:string,customerId:string,idempotencyKey:string)=>adminRequest<ProcessorCard>('/cards/create',key,body({tenantId,customerId,cardProduct:100,cardHolder:{firstName:'FastLink',lastName:'Sandbox'},currency:'USD',alias:'Sprint-03 Acceptance',idempotencyKey})),
 retrieveProcessorCard:(tenantId:string,key:string,cardId:string)=>adminRequest<ProcessorCard>(`/cards/${cardId}?tenantId=${encodeURIComponent(tenantId)}`,key),
 freezeProcessorCard:(tenantId:string,key:string,cardId:string,idempotencyKey:string)=>adminRequest<ProcessorCard>('/cards/freeze',key,body({tenantId,cardId,idempotencyKey})),
 unfreezeProcessorCard:(tenantId:string,key:string,cardId:string,idempotencyKey:string)=>adminRequest<ProcessorCard>('/cards/unfreeze',key,body({tenantId,cardId,idempotencyKey})),
 processorCardBalance:(tenantId:string,key:string,cardId:string)=>adminRequest<ProcessorCardBalance>(`/cards/balance?tenantId=${encodeURIComponent(tenantId)}&cardId=${encodeURIComponent(cardId)}`,key),
 createWallet:(tenantId:string,key:string,customerId:string,name:string)=>adminRequest<WalletAccount>(`/admin/tenants/${tenantId}/wallet/accounts`,key,body({environment:'SANDBOX',customerId,assetCode:'USD',name})),
 deposit:(tenantId:string,key:string,walletAccountId:string,amount:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/deposits`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',amount,walletAccountId,externalReference:'ADMIN_ACCEPTANCE_FLOW'})),
 transfer:(tenantId:string,key:string,sourceAccountId:string,destinationAccountId:string,amount:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/transfers`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',amount,sourceAccountId,destinationAccountId,externalReference:'ADMIN_ACCEPTANCE_FLOW'})),
 withdraw:(tenantId:string,key:string,walletAccountId:string,amount:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/withdrawals`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',amount,walletAccountId,externalReference:'ADMIN_ACCEPTANCE_FLOW'})),
 settleWithdrawal:(tenantId:string,key:string,operationId:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/withdrawals/${operationId}/settle`,key,body({environment:'SANDBOX',idempotencyKey})),
 reserve:(tenantId:string,key:string,sponsorReserve:string,requiredReserve:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/treasury/reserve`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',sponsorReserve,requiredReserve})),
}
