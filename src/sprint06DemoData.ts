export type DemoCardStatus='ACTIVE'|'FROZEN'|'PENDING'|'CLOSED'
export type DemoTransactionStatus='APPROVED'|'DECLINED'|'PENDING'

export type DemoUser={id:string;name:string;country:string;currency:string;walletBalance:number;risk:'LOW'|'MEDIUM'|'HIGH';createdAt:string}
export type DemoCard={id:string;userId:string;holder:string;type:'VIRTUAL'|'PHYSICAL';status:DemoCardStatus;provider:'THREDD_MOCK';maskedPan:string;expiry:string;currency:string;balance:number;createdAt:string}
export type DemoTransaction={id:string;cardId:string;userId:string;type:'PURCHASE'|'ATM'|'REFUND'|'CARD_FUNDING';status:DemoTransactionStatus;merchant:string;country:string;currency:string;amount:number;riskScore:number;createdAt:string}
export type DemoSettlement={id:string;currency:string;amount:number;status:'PENDING'|'COMPLETED'|'FAILED';transactionCount:number;expectedAt:string}
export type DemoWebhook={id:string;event:string;status:'DELIVERED'|'RETRYING'|'FAILED';attempts:number;endpoint:string;occurredAt:string}
export type Sprint06DemoData={users:DemoUser[];cards:DemoCard[];transactions:DemoTransaction[];settlements:DemoSettlement[];webhooks:DemoWebhook[]}

const currencies=['USD','EUR','GBP','MYR','SGD','USDT'] as const
const countries=['MY','SG','HK','AE','GB','TH','VN','ID'] as const
const merchants=['Grab','AirAsia','Apple','Amazon','Shopee','Lazada','Starbucks','Booking.com','ATM Network','FastLink FX'] as const

function isoDaysAgo(days:number,hour=8){
 const value=new Date(Date.UTC(2026,6,21-days,hour,0,0))
 return value.toISOString()
}

export function createSprint06DemoData():Sprint06DemoData{
 const users=Array.from({length:1000},(_,index):DemoUser=>{
  const number=index+1
  return {id:`USR-${String(number).padStart(4,'0')}`,name:`Demo User ${String(number).padStart(4,'0')}`,country:countries[index%countries.length],currency:currencies[index%currencies.length],walletBalance:500+((index*137)%24500),risk:index%97===0?'HIGH':index%13===0?'MEDIUM':'LOW',createdAt:isoDaysAgo(index%180)}
 })
 const cards=Array.from({length:100},(_,index):DemoCard=>{
  const number=index+1
  const user=users[(index*7)%users.length]
  const status:DemoCardStatus=index%29===0?'PENDING':index%11===0?'FROZEN':'ACTIVE'
  return {id:`CRD-${String(number).padStart(4,'0')}`,userId:user.id,holder:user.name,type:index%4===0?'PHYSICAL':'VIRTUAL',status,provider:'THREDD_MOCK',maskedPan:`5239 •••• •••• ${String(2100+number).slice(-4)}`,expiry:`${String((index%12)+1).padStart(2,'0')}/29`,currency:user.currency,balance:50+((index*83)%4950),createdAt:isoDaysAgo(index%120)}
 })
 const transactions=Array.from({length:10000},(_,index):DemoTransaction=>{
  const number=index+1
  const card=cards[index%cards.length]
  const status:DemoTransactionStatus=index%41===0?'DECLINED':index%59===0?'PENDING':'APPROVED'
  const type:DemoTransaction['type']=index%23===0?'REFUND':index%17===0?'ATM':index%13===0?'CARD_FUNDING':'PURCHASE'
  return {id:`TXN-${String(number).padStart(5,'0')}`,cardId:card.id,userId:card.userId,type,status,merchant:merchants[index%merchants.length],country:countries[(index*3)%countries.length],currency:card.currency,amount:Number((2.5+((index*19)%180000)/100).toFixed(2)),riskScore:status==='DECLINED'?78+(index%21):12+(index%64),createdAt:isoDaysAgo(index%90,index%24)}
 })
 const settlements=Array.from({length:36},(_,index):DemoSettlement=>({id:`STL-${String(index+1).padStart(4,'0')}`,currency:currencies[index%currencies.length],amount:25000+((index*11891)%375000),status:index%13===0?'FAILED':index%4===0?'PENDING':'COMPLETED',transactionCount:80+((index*53)%640),expectedAt:isoDaysAgo(index%15)}))
 const events=['card.created','card.frozen','card.unfrozen','transaction.authorized','transaction.declined','settlement.completed']
 const webhooks=Array.from({length:120},(_,index):DemoWebhook=>({id:`WH-${String(index+1).padStart(4,'0')}`,event:events[index%events.length],status:index%31===0?'FAILED':index%17===0?'RETRYING':'DELIVERED',attempts:index%31===0?5:index%17===0?2:1,endpoint:`https://sandbox.partner-${(index%4)+1}.example/webhooks`,occurredAt:isoDaysAgo(index%30,index%24)}))
 return {users,cards,transactions,settlements,webhooks}
}

export function csvText(rows:Array<Record<string,string|number>>){
 if(!rows.length)return ''
 const headers=Object.keys(rows[0])
 const safe=(value:string|number)=>{
  let text=String(value ?? '')
  if(/^[=+\-@]/.test(text))text=`'${text}`
  return `"${text.replaceAll('"','""')}"`
 }
 return [headers.map(safe).join(','),...rows.map(row=>headers.map(key=>safe(row[key])).join(','))].join('\n')
}

export function downloadCsv(filename:string,rows:Array<Record<string,string|number>>){
 const blob=new Blob([`\uFEFF${csvText(rows)}`],{type:'text/csv;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const anchor=document.createElement('a')
 anchor.href=url;anchor.download=filename;anchor.click()
 URL.revokeObjectURL(url)
}
