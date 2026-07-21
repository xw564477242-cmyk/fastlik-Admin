import {useState} from 'react'
import {BookOpenCheck,CheckCircle2,CircleX,Landmark,LoaderCircle,Play,Search,ShieldCheck,WalletCards} from 'lucide-react'
import {businessFlowApi,type BusinessFlowEvidence} from './businessFlowApi'

type Props={tenantId:string;apiKey:string;notify:(message:string)=>void}
const labels:Record<string,string>={userRegistered:'用户注册',kycApproved:'KYC Approved',fiveCurrencyWallets:'五币种钱包',virtualCardCreated:'虚拟卡',merchantPaymentSettled:'商户消费结算',walletTransactionWritten:'WalletTransaction',cardTransactionWritten:'CardTransaction',journalWritten:'Journal',treasuryUpdated:'Treasury',settlementBatchCreated:'SettlementBatch',auditWritten:'Audit Log',trialBalanceBalanced:'Trial Balance'}
const newTrace=()=>`sprint09-${Date.now().toString(36)}`

export default function Sprint09BusinessAcceptance({tenantId,apiKey,notify}:Props){
 const[traceId,setTraceId]=useState(newTrace)
 const[evidence,setEvidence]=useState<BusinessFlowEvidence|null>(null)
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const execute=async(mode:'run'|'query')=>{
  if(!tenantId||!apiKey){setError('请先连接 Admin API 并选择 Sandbox 租户');return}
  setBusy(mode);setError('')
  try{const data=mode==='run'?await businessFlowApi.run(tenantId,apiKey,traceId):await businessFlowApi.trace(tenantId,apiKey,traceId);setEvidence(data);notify(mode==='run'?'Sprint-09 完整业务闭环执行完成':'业务 Trace 已载入')}
  catch(e){setEvidence(null);setError(e instanceof Error?e.message:'业务闭环执行失败')}
  finally{setBusy('')}
 }
 const payment=evidence?.payments[0]
 const usd=evidence?.treasury.find(x=>x.assetCode==='USD')
 return <section className="s09-acceptance">
  <header><div><span>SPRINT-09 · END-TO-END BUSINESS CAPABILITY</span><h3>注册 → 钱包 → 发卡 → 消费 → Ledger → Treasury → Settlement → Admin</h3><p>同一 Trace ID 串联正式业务表；重复执行不会重复扣款。仅允许 Sandbox。</p></div><ShieldCheck/></header>
  <div className="s09-controls"><input value={traceId} onChange={e=>setTraceId(e.target.value)} placeholder="输入 Trace ID"/><button type="button" onClick={()=>void execute('query')} disabled={!traceId||!!busy}>{busy==='query'?<LoaderCircle className="spin"/>:<Search/>}查询</button><button type="button" className="primary" onClick={()=>void execute('run')} disabled={!traceId||!!busy}>{busy==='run'?<LoaderCircle className="spin"/>:<Play/>}运行完整闭环</button><button type="button" onClick={()=>{setTraceId(newTrace());setEvidence(null);setError('')}}>新 Trace</button></div>
  {error&&<div className="s09-error"><CircleX/>{error}</div>}
  {evidence&&<>
   <div className={`s09-result ${evidence.status==='COMPLETED'?'complete':'incomplete'}`}><div><span>验收结果</span><strong>{evidence.status}</strong><small>{evidence.traceId}</small></div><div><WalletCards/><span>Wallet</span><strong>{evidence.wallets.length}</strong><small>USD余额 {evidence.wallets.find(x=>x.assetCode==='USD')?.postedBalance??'—'}</small></div><div><BookOpenCheck/><span>Journals</span><strong>{evidence.journals.length}</strong><small>{evidence.walletTransactions.length} Wallet Tx</small></div><div><Landmark/><span>Treasury USD</span><strong>{usd?.availableBalance??'—'}</strong><small>Pending {usd?.pendingSettlement??'—'}</small></div></div>
   <div className="s09-checks">{Object.entries(evidence.checks).map(([key,ok])=><div className={ok?'ok':'bad'} key={key}>{ok?<CheckCircle2/>:<CircleX/>}<span>{labels[key]??key}</span><b>{ok?'PASS':'FAIL'}</b></div>)}</div>
   <div className="s09-details"><article><h4>用户与卡</h4><p><span>用户</span><b>{evidence.customer.externalUserId}</b></p><p><span>KYC</span><b>{evidence.customer.kycStatus}</b></p><p><span>卡片</span><b>{evidence.cards[0]?.type} · {evidence.cards[0]?.status} · •••• {evidence.cards[0]?.last4}</b></p></article><article><h4>消费与结算</h4><p><span>商户</span><b>{payment?.merchant?.name??'—'}</b></p><p><span>Payment</span><b>{payment?.amount} USD · {payment?.status}</b></p><p><span>SettlementBatch</span><b>{payment?.settlementBatch?.id??'—'}</b></p></article><article><h4>可追溯证据</h4><p><span>CardTransaction</span><b>{evidence.cardTransactions.length}</b></p><p><span>Audit / Events</span><b>{evidence.audits.length} / {evidence.events.length}</b></p><p><span>Trial Balance</span><b>{evidence.trialBalance.every(x=>x.balanced)?'BALANCED':'UNBALANCED'}</b></p></article></div>
   <div className="s09-timeline"><h4>业务时间线</h4>{evidence.journals.map((journal,index)=><div key={journal.id}><em>{index+1}</em><span><b>{journal.referenceType}</b><small>{journal.description}</small></span><strong>{journal.entries.map(entry=>`${entry.side} ${entry.amount} ${entry.assetCode}`).join(' · ')}</strong></div>)}</div>
  </>}
 </section>
}
