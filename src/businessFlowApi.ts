import {getApiBase} from './treasuryApi'

export type BusinessFlowEvidence={
 traceId:string
 environment:'SANDBOX'
 status:'COMPLETED'|'INCOMPLETE'
 checks:Record<string,boolean>
 customer:{id:string;externalUserId:string;email:string;kycStatus:string}
 wallets:Array<{id:string;assetCode:string;postedBalance:string}>
 cards:Array<{id:string;type:string;status:string;last4?:string}>
 payments:Array<{id:string;status:string;amount:string;merchant:{name:string};settlementBatch?:{id:string;status:string;items:Array<{id:string;status:string}>}|null}>
 walletTransactions:Array<{id:string;type:string;status:string;amount:string;assetCode:string}>
 cardTransactions:Array<{id:string;status:string;amountMinor:string;currency:string;merchantName?:string}>
 journals:Array<{id:string;referenceType:string;description:string;entries:Array<{id:string;side:string;amount:string;assetCode:string}>}>
 treasury:Array<{assetCode:string;availableBalance:string;pendingSettlement:string;sponsorReserve:string}>
 audits:Array<{id:string;action:string;resource:string;createdAt:string}>
 events:Array<{id:string;eventType:string;status:string;createdAt:string}>
 trialBalance:Array<{assetCode:string;debit:string;credit:string;balanced:boolean}>
}

async function request<T>(path:string,apiKey:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`${getApiBase()}${path}`,{...init,mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','x-admin-api-key':apiKey,...(init?.headers||{})}})
 if(!response.ok){let message=`API ${response.status}`;try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}throw new Error(message)}
 return response.json() as Promise<T>
}

export const businessFlowApi={
 run:(tenantId:string,apiKey:string,traceId:string)=>request<BusinessFlowEvidence>(`/admin/tenants/${tenantId}/business-flows/complete-card-purchase`,apiKey,{method:'POST',body:JSON.stringify({traceId,environment:'SANDBOX',depositAmount:'1000.00',purchaseAmount:'25.00',cardProduct:100})}),
 trace:(tenantId:string,apiKey:string,traceId:string)=>request<BusinessFlowEvidence>(`/admin/tenants/${tenantId}/business-flows/${encodeURIComponent(traceId)}?environment=SANDBOX`,apiKey),
}
