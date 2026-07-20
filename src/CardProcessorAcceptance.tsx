import {useState} from 'react'
import {CheckCircle2,CreditCard,LoaderCircle,Play,Snowflake,Sun} from 'lucide-react'
import {walletBusinessApi,type ProcessorCard,type ProcessorCardBalance} from './walletBusinessApi'

type Props={tenantId:string;apiKey:string;notify:(message:string)=>void}

export default function CardProcessorAcceptance({tenantId,apiKey,notify}:Props){
 const[busy,setBusy]=useState(false)
 const[card,setCard]=useState<ProcessorCard|null>(null)
 const[balance,setBalance]=useState<ProcessorCardBalance|null>(null)
 const[logs,setLogs]=useState<string[]>([])
 const[error,setError]=useState('')

 const run=async()=>{
  if(!tenantId||!apiKey){setError('请先连接 Admin API 并选择 Sandbox 租户');return}
  const stamp=Date.now().toString(36)
  const log=(value:string)=>setLogs(rows=>[...rows,value])
  setBusy(true);setError('');setLogs([]);setCard(null);setBalance(null)
  try{
   log('→ Customer Mapping')
   const customer=await walletBusinessApi.createCardCustomer(tenantId,apiKey,`sprint03-${stamp}`);log(`✓ Customer Mapping · ${customer.id}`)
   log('→ POST /cards/create')
   const created=await walletBusinessApi.createProcessorCard(tenantId,apiKey,customer.id,`sprint03:${stamp}:create`);setCard(created);log(`✓ CardService → CardProcessor → ${created.provider} · ${created.id}`)
   log(`→ GET /cards/${created.id}`)
   const retrieved=await walletBusinessApi.retrieveProcessorCard(tenantId,apiKey,created.id);log(`✓ Retrieve Card · ${retrieved.status} · ${retrieved.maskedPan||retrieved.providerPublicToken}`)
   log('→ POST /cards/freeze')
   const frozen=await walletBusinessApi.freezeProcessorCard(tenantId,apiKey,created.id,`sprint03:${stamp}:freeze`);setCard(frozen);log(`✓ Freeze · ${frozen.status}`)
   log('→ POST /cards/unfreeze')
   const active=await walletBusinessApi.unfreezeProcessorCard(tenantId,apiKey,created.id,`sprint03:${stamp}:unfreeze`);setCard(active);log(`✓ Unfreeze · ${active.status}`)
   log('→ GET /cards/balance')
   const current=await walletBusinessApi.processorCardBalance(tenantId,apiKey,created.id);setBalance(current);log(`✓ Card Balance · ${current.availableBalanceMinor} minor ${current.currency}`)
   notify('Sprint-03 CardProcessor Mock 验收成功')
  }catch(e){const message=e instanceof Error?e.message:'CardProcessor 验收失败';setError(message);log(`✗ ${message}`)}finally{setBusy(false)}
 }

 return <section className="wbc-card-acceptance">
  <div className="wbc-card-title"><div><span>SPRINT-03 · CARD SERVICE CONTRACT</span><h3><CreditCard/>Card Processor 验收</h3><p>Customer Mapping → /cards/create → Retrieve → Freeze → Unfreeze → Balance</p></div><button onClick={()=>void run()} disabled={busy||!tenantId}>{busy?<LoaderCircle className="spin"/>:<Play/>}{busy?'执行中…':'运行卡片完整流'}</button></div>
  {error&&<div className="wbc-error">{error}</div>}
  <div className="wbc-card-result"><article><CreditCard/><span>Provider</span><b>{card?.provider||'—'}</b><small>{card?.id||'等待执行'}</small></article><article><CheckCircle2/><span>Status</span><b>{card?.status||'—'}</b><small>{card?.maskedPan||'Virtual Card'}</small></article><article><Snowflake/><span>Freeze</span><b>{logs.some(x=>x.includes('Freeze · FROZEN'))?'PASSED':'—'}</b><small>Thredd code 05 / Mock</small></article><article><Sun/><span>Balance</span><b>{balance?.availableBalanceMinor??'—'}</b><small>{balance?.currency||'minor units'}</small></article></div>
  {logs.length>0&&<pre>{logs.join('\n')}</pre>}
 </section>
}
