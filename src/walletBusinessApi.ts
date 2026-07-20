import {getApiBase} from './treasuryApi'

export type Tenant={id:string;brandName:string;legalName:string;environment:'SANDBOX'|'PRODUCTION'}
export type WalletAccount={id:string;accountCode:string;name:string;customerId?:string;assetCode:string;postedBalance:string;pendingBalance:string}
export type TreasuryPosition={id:string;assetCode:string;sponsorReserve:string;requiredReserve:string;availableBalance:string;pendingSettlement:string;liquidityRatio:string|null;totalControlled:string}
export type WalletOperation={id:string;type:string;status:string;assetCode:string;amount:string;sourceAccountId?:string;destinationAccountId?:string;journalIds:string[];createdAt:string}
export type Journal={id:string;referenceType:string;referenceId?:string;description:string;postedAt:string;entries:Array<{id:string;walletAccountId:string;side:'DEBIT'|'CREDIT';amount:string;assetCode:string;memo?:string}>}
export type TrialBalance={assetCode:string;debit:string;credit:string;balanced:boolean}

const keyName='fastlink_admin_api_key'
export const getAdminKey=()=>sessionStorage.getItem(keyName)||''
export const setAdminKey=(value:string)=>value?sessionStorage.setItem(keyName,value):sessionStorage.removeItem(keyName)

async function adminRequest<T>(path:string,apiKey:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`${getApiBase()}${path}`,{...init,headers:{'Content-Type':'application/json','x-admin-api-key':apiKey,...(init?.headers||{})}})
 if(!response.ok){let message=`API ${response.status}`;try{const body=await response.json();message=Array.isArray(body.message)?body.message.join(', '):(body.message||message)}catch{}throw new Error(message)}
 return response.json() as Promise<T>
}

const body=(value:unknown):RequestInit=>({method:'POST',body:JSON.stringify(value)})
export const walletBusinessApi={
 tenants:(key:string)=>adminRequest<Tenant[]>('/admin/tenants',key),
 accounts:(tenantId:string,key:string)=>adminRequest<WalletAccount[]>(`/admin/tenants/${tenantId}/ledger/accounts?environment=SANDBOX`,key),
 operations:(tenantId:string,key:string)=>adminRequest<WalletOperation[]>(`/admin/tenants/${tenantId}/wallet/operations?environment=SANDBOX`,key),
 treasury:(tenantId:string,key:string)=>adminRequest<TreasuryPosition[]>(`/admin/tenants/${tenantId}/wallet/treasury?environment=SANDBOX`,key),
 journals:(tenantId:string,key:string)=>adminRequest<Journal[]>(`/admin/tenants/${tenantId}/ledger/journals?environment=SANDBOX`,key),
 trialBalance:(tenantId:string,key:string)=>adminRequest<TrialBalance[]>(`/admin/tenants/${tenantId}/ledger/trial-balance?environment=SANDBOX`,key),
 createWallet:(tenantId:string,key:string,customerId:string,name:string)=>adminRequest<WalletAccount>(`/admin/tenants/${tenantId}/wallet/accounts`,key,body({environment:'SANDBOX',customerId,assetCode:'USD',name})),
 deposit:(tenantId:string,key:string,walletAccountId:string,amount:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/deposits`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',amount,walletAccountId,externalReference:'ADMIN_ACCEPTANCE_FLOW'})),
 transfer:(tenantId:string,key:string,sourceAccountId:string,destinationAccountId:string,amount:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/transfers`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',amount,sourceAccountId,destinationAccountId,externalReference:'ADMIN_ACCEPTANCE_FLOW'})),
 withdraw:(tenantId:string,key:string,walletAccountId:string,amount:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/withdrawals`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',amount,walletAccountId,externalReference:'ADMIN_ACCEPTANCE_FLOW'})),
 settleWithdrawal:(tenantId:string,key:string,operationId:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/withdrawals/${operationId}/settle`,key,body({environment:'SANDBOX',idempotencyKey})),
 reserve:(tenantId:string,key:string,sponsorReserve:string,requiredReserve:string,idempotencyKey:string)=>adminRequest<any>(`/admin/tenants/${tenantId}/wallet/treasury/reserve`,key,body({environment:'SANDBOX',idempotencyKey,assetCode:'USD',sponsorReserve,requiredReserve})),
}
