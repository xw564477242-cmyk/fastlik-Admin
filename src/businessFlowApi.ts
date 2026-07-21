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

type UnknownRecord=Record<string,unknown>
const record=(value:unknown):UnknownRecord=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as UnknownRecord:{}
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[]
const text=(value:unknown,fallback='—')=>typeof value==='string'||typeof value==='number'?String(value):fallback
const requiredChecks=['userRegistered','kycApproved','fiveCurrencyWallets','virtualCardCreated','merchantPaymentSettled','walletTransactionWritten','cardTransactionWritten','journalWritten','treasuryUpdated','settlementBatchCreated','auditWritten','trialBalanceBalanced']

/** Keep a partially deployed API response from crashing the whole Admin UI. */
export function normalizeBusinessFlowEvidence(payload:unknown):BusinessFlowEvidence{
 const source=record(payload)
 const customer=record(source.customer)
 const checks=record(source.checks)
 const safeChecks=Object.fromEntries([...new Set([...requiredChecks,...Object.keys(checks)])].map(key=>[key,checks[key]===true]))
 return {
  traceId:text(source.traceId,'unknown-trace'),environment:'SANDBOX',status:source.status==='COMPLETED'&&Object.values(safeChecks).every(Boolean)?'COMPLETED':'INCOMPLETE',
  checks:safeChecks,
  customer:{id:text(customer.id),externalUserId:text(customer.externalUserId),email:text(customer.email),kycStatus:text(customer.kycStatus)},
  wallets:list(source.wallets).map(item=>{const row=record(item);return{id:text(row.id),assetCode:text(row.assetCode),postedBalance:text(row.postedBalance,'0')}}),
  cards:list(source.cards).map(item=>{const row=record(item);return{id:text(row.id),type:text(row.type),status:text(row.status),last4:text(row.last4)}}),
  payments:list(source.payments).map(item=>{const row=record(item);const merchant=record(row.merchant);const batch=row.settlementBatch?record(row.settlementBatch):null;return{id:text(row.id),status:text(row.status),amount:text(row.amount,'0'),merchant:{name:text(merchant.name)},settlementBatch:batch?{id:text(batch.id),status:text(batch.status),items:list(batch.items).map(value=>{const entry=record(value);return{id:text(entry.id),status:text(entry.status)}})}:null}}),
  walletTransactions:list(source.walletTransactions).map(item=>{const row=record(item);return{id:text(row.id),type:text(row.type),status:text(row.status),amount:text(row.amount,'0'),assetCode:text(row.assetCode)}}),
  cardTransactions:list(source.cardTransactions).map(item=>{const row=record(item);return{id:text(row.id),status:text(row.status),amountMinor:text(row.amountMinor,'0'),currency:text(row.currency),merchantName:text(row.merchantName)}}),
  journals:list(source.journals).map(item=>{const row=record(item);return{id:text(row.id),referenceType:text(row.referenceType),description:text(row.description),entries:list(row.entries).map(value=>{const entry=record(value);return{id:text(entry.id),side:text(entry.side),amount:text(entry.amount,'0'),assetCode:text(entry.assetCode)}})}}),
  treasury:list(source.treasury).map(item=>{const row=record(item);return{assetCode:text(row.assetCode),availableBalance:text(row.availableBalance,'0'),pendingSettlement:text(row.pendingSettlement,'0'),sponsorReserve:text(row.sponsorReserve,'0')}}),
  audits:list(source.audits).map(item=>{const row=record(item);return{id:text(row.id),action:text(row.action),resource:text(row.resource),createdAt:text(row.createdAt)}}),
  events:list(source.events).map(item=>{const row=record(item);return{id:text(row.id),eventType:text(row.eventType),status:text(row.status),createdAt:text(row.createdAt)}}),
  trialBalance:list(source.trialBalance).map(item=>{const row=record(item);return{assetCode:text(row.assetCode),debit:text(row.debit,'0'),credit:text(row.credit,'0'),balanced:row.balanced===true}}),
 }
}

async function request<T>(path:string,apiKey:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`${getApiBase()}${path}`,{...init,mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','x-admin-api-key':apiKey,...(init?.headers||{})}})
 if(!response.ok){let message=`API ${response.status}`;try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}throw new Error(message)}
 const payload:unknown=await response.json()
 return payload as T
}

export const businessFlowApi={
 run:async(tenantId:string,apiKey:string,traceId:string)=>normalizeBusinessFlowEvidence(await request<unknown>(`/admin/tenants/${tenantId}/business-flows/complete-card-purchase`,apiKey,{method:'POST',body:JSON.stringify({traceId,environment:'SANDBOX',depositAmount:'1000.00',purchaseAmount:'25.00',cardProduct:100})})),
 trace:async(tenantId:string,apiKey:string,traceId:string)=>normalizeBusinessFlowEvidence(await request<unknown>(`/admin/tenants/${tenantId}/business-flows/${encodeURIComponent(traceId)}?environment=SANDBOX`,apiKey)),
}
