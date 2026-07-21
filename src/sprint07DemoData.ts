export type MerchantStatus='ACTIVE'|'REVIEW'|'SUSPENDED'
export type TestingStatus='ACTIVE'|'FROZEN'|'PENDING'
export type TxStatus='APPROVED'|'DECLINED'|'PENDING'

export type DemoMerchant={id:string;name:string;region:string;industry:string;status:MerchantStatus;settlementCurrency:string;monthlyVolume:number;transactionCount:number;chargebackRate:number;createdAt:string}
export type TestingWallet={id:string;userId:string;merchantId:string;currency:string;balance:number;status:TestingStatus;createdAt:string}
export type TestingCard={id:string;userId:string;merchantId:string;type:'VIRTUAL'|'PHYSICAL';maskedPan:string;currency:string;balance:number;status:TestingStatus;createdAt:string}
export type MerchantTransaction={id:string;merchantId:string;cardId:string;walletId:string;type:'PURCHASE'|'ATM'|'REFUND'|'FUNDING';currency:string;amount:number;status:TxStatus;riskScore:number;occurredAt:string}
export type CardHistoryEvent={id:string;cardId:string;event:'CREATED'|'ACTIVATED'|'FROZEN'|'UNFROZEN'|'BALANCE_CHECK'|'PIN_UPDATED'|'CVV_REVEALED';actor:string;fromStatus:string;toStatus:string;occurredAt:string}
export type Sprint07DemoData={merchants:DemoMerchant[];wallets:TestingWallet[];cards:TestingCard[];transactions:MerchantTransaction[];cardHistory:CardHistoryEvent[]}

const currencies=['USD','EUR','GBP','MYR','SGD','USDT'] as const
const regions=['MY','SG','HK','AE','GB','TH','VN','ID'] as const
const industries=['Travel','E-commerce','Digital Services','Retail','Marketplace','Hospitality'] as const
const names=['Nova Commerce','Orbit Travel','BluePeak Market','Astra Retail','Meridian Pay','Kuala Digital','Lion City Shop','Harbour Services'] as const

function isoDaysAgo(days:number,hour=8){return new Date(Date.UTC(2026,6,21-days,hour,0,0)).toISOString()}

export function createSprint07DemoData():Sprint07DemoData{
 const merchants=Array.from({length:100},(_,index):DemoMerchant=>{
  const number=index+1
  const status:MerchantStatus=index%29===0?'SUSPENDED':index%11===0?'REVIEW':'ACTIVE'
  return {id:`MER-${String(number).padStart(3,'0')}`,name:`${names[index%names.length]} ${number}`,region:regions[index%regions.length],industry:industries[index%industries.length],status,settlementCurrency:currencies[index%currencies.length],monthlyVolume:75000+((index*39173)%1425000),transactionCount:72+((index*61)%640),chargebackRate:Number(((index%17)*0.07).toFixed(2)),createdAt:isoDaysAgo(index%220)}
 })
 const wallets=Array.from({length:1000},(_,index):TestingWallet=>{
  const merchant=merchants[index%merchants.length]
  const status:TestingStatus=index%83===0?'FROZEN':index%61===0?'PENDING':'ACTIVE'
  return {id:`WLT-${String(index+1).padStart(4,'0')}`,userId:`USR-${String(index+1).padStart(4,'0')}`,merchantId:merchant.id,currency:currencies[index%currencies.length],balance:Number((250+((index*173)%49750)).toFixed(2)),status,createdAt:isoDaysAgo(index%180)}
 })
 const cards=Array.from({length:500},(_,index):TestingCard=>{
  const wallet=wallets[(index*2)%wallets.length]
  const status:TestingStatus=index%37===0?'FROZEN':index%43===0?'PENDING':'ACTIVE'
  return {id:`CARD-${String(index+1).padStart(4,'0')}`,userId:wallet.userId,merchantId:wallet.merchantId,type:index%4===0?'PHYSICAL':'VIRTUAL',maskedPan:`5239 •••• •••• ${String(4100+index+1).slice(-4)}`,currency:wallet.currency,balance:Number((25+((index*89)%7900)).toFixed(2)),status,createdAt:isoDaysAgo(index%150)}
 })
 const transactions=Array.from({length:10000},(_,index):MerchantTransaction=>{
  const card=cards[index%cards.length];const wallet=wallets[index%wallets.length]
  const status:TxStatus=index%47===0?'DECLINED':index%67===0?'PENDING':'APPROVED'
  const type:MerchantTransaction['type']=index%31===0?'REFUND':index%19===0?'ATM':index%13===0?'FUNDING':'PURCHASE'
  return {id:`MTX-${String(index+1).padStart(5,'0')}`,merchantId:card.merchantId,cardId:card.id,walletId:wallet.id,type,currency:card.currency,amount:Number((1.5+((index*23)%220000)/100).toFixed(2)),status,riskScore:status==='DECLINED'?80+(index%19):10+(index%68),occurredAt:isoDaysAgo(index%90,index%24)}
 })
 const eventNames:CardHistoryEvent['event'][]=['CREATED','ACTIVATED','FROZEN','UNFROZEN','BALANCE_CHECK','PIN_UPDATED','CVV_REVEALED']
 const cardHistory=Array.from({length:2500},(_,index):CardHistoryEvent=>{
  const card=cards[index%cards.length];const event=eventNames[index%eventNames.length]
  const statuses:Record<CardHistoryEvent['event'],[string,string]>={CREATED:['—','PENDING'],ACTIVATED:['PENDING','ACTIVE'],FROZEN:['ACTIVE','FROZEN'],UNFROZEN:['FROZEN','ACTIVE'],BALANCE_CHECK:[card.status,card.status],PIN_UPDATED:[card.status,card.status],CVV_REVEALED:[card.status,card.status]}
  const[fromStatus,toStatus]=statuses[event]
  return {id:`CHE-${String(index+1).padStart(5,'0')}`,cardId:card.id,event,actor:index%5===0?'CARDHOLDER':'SANDBOX_ADMIN',fromStatus,toStatus,occurredAt:isoDaysAgo(index%120,index%24)}
 })
 return {merchants,wallets,cards,transactions,cardHistory}
}
