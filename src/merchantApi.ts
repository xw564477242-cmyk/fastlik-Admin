import {DEFAULT_API} from './treasuryApi'

export type Merchant={id:string;externalMerchantId:string;name:string;mcc:string;settlementAssetCode:string;status:string;createdAt:string}
export type MerchantPayment={id:string;merchantId:string;walletAccountId:string;cardId?:string;status:string;assetCode:string;amount:string;journalIds:string[];authorizedAt?:string;clearedAt?:string;settledAt?:string;refundedAt?:string;createdAt:string;merchant?:Merchant}
export type MerchantQr={id:string;merchantId:string;qrCode:string;assetCode:string;amount:string|null;status:string;expiresAt:string;paymentUri:string}
export type MerchantDetail=Merchant&{payments:MerchantPayment[];qrCodes:MerchantQr[]}
export type MerchantPage<T>={data:T[];total:number;limit:number;offset:number}

async function request<T>(path:string,apiKey:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`${DEFAULT_API}${path}`,{...init,mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','x-admin-api-key':apiKey,...(init?.headers||{})}})
 if(!response.ok){let message=`API ${response.status}`;try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}throw new Error(`${message} · ${response.status} ${path}`)}
 return response.json() as Promise<T>
}

const post=(value:unknown):RequestInit=>({method:'POST',body:JSON.stringify(value)})
const environment='SANDBOX'

export const merchantApi={
 list:(tenantId:string,key:string,search='')=>request<MerchantPage<Merchant>>(`/admin/tenants/${tenantId}/merchants?environment=${environment}&limit=100${search?`&search=${encodeURIComponent(search)}`:''}`,key),
 history:(tenantId:string,key:string)=>request<MerchantPage<MerchantPayment>>(`/admin/tenants/${tenantId}/merchant/payments?environment=${environment}&limit=100`,key),
 detail:(tenantId:string,key:string,merchantId:string)=>request<MerchantDetail>(`/admin/tenants/${tenantId}/merchants/${merchantId}?environment=${environment}`,key),
 createQr:(tenantId:string,key:string,merchantId:string,amount:string)=>request<MerchantQr>(`/admin/tenants/${tenantId}/merchants/${merchantId}/qr-codes`,key,post({environment,amount,expiresInMinutes:15})),
 payQr:(tenantId:string,key:string,qrCode:string,walletAccountId:string,idempotencyKey:string)=>request<MerchantPayment>(`/admin/tenants/${tenantId}/merchant/qr/pay`,key,post({environment,qrCode,walletAccountId,idempotencyKey})),
 action:(tenantId:string,key:string,paymentId:string,action:'clear'|'settle'|'reverse'|'refund',idempotencyKey:string)=>request<MerchantPayment>(`/admin/tenants/${tenantId}/merchant/payments/${paymentId}/${action}`,key,post({environment,idempotencyKey})),
}
