import {useEffect,useMemo,useState} from 'react'
import {ArrowLeftRight,BookOpenCheck,CheckCircle2,KeyRound,Landmark,LoaderCircle,Play,RefreshCw,WalletCards,X} from 'lucide-react'
import {getAdminKey,setAdminKey,walletBusinessApi,type Journal,type RiskDashboard,type SettlementDashboard,type Tenant,type TreasuryPosition,type TrialBalance,type WalletAccount,type WalletOperation} from './walletBusinessApi'
import CardProcessorAcceptance from './CardProcessorAcceptance'
import Sprint09BusinessAcceptance from './Sprint09BusinessAcceptance'

type Props={onClose:()=>void;onOpenLegacy:()=>void;notify:(message:string)=>void}
const amount=(value:string|number)=>Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})

export default function WalletBusinessCenter({onClose,onOpenLegacy,notify}:Props){
 const[key,setKey]=useState(getAdminKey())
 const[tenants,setTenants]=useState<Tenant[]>([])
 const[tenantId,setTenantId]=useState(sessionStorage.getItem('fastlink_wallet_tenant')||'')
 const[accounts,setAccounts]=useState<WalletAccount[]>([])
 const[positions,setPositions]=useState<TreasuryPosition[]>([])
 const[operations,setOperations]=useState<WalletOperation[]>([])
 const[journals,setJournals]=useState<Journal[]>([])
 const[trial,setTrial]=useState<TrialBalance[]>([])
 const[settlement,setSettlement]=useState<SettlementDashboard|null>(null)
 const[risk,setRisk]=useState<RiskDashboard|null>(null)
 const[dashboardNotice,setDashboardNotice]=useState('')
 const[needsSandbox,setNeedsSandbox]=useState(false)
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const[runLog,setRunLog]=useState<string[]>([])
 const position=positions.find(x=>x.assetCode==='USD')
 const customerAccounts=useMemo(()=>accounts.filter(x=>x.customerId),[accounts])

 const loadData=async(id=tenantId,apiKey=key)=>{
  if(!id||!apiKey)return false
  setBusy('refresh');setError('')
  try{
   const[a,p,o,j,t]=await Promise.all([walletBusinessApi.accounts(id,apiKey),walletBusinessApi.treasury(id,apiKey),walletBusinessApi.operations(id,apiKey),walletBusinessApi.journals(id,apiKey),walletBusinessApi.trialBalance(id,apiKey)])
   setAccounts(a);setPositions(p);setOperations(o);setJournals(j);setTrial(t)
   const[s,r]=await Promise.allSettled([walletBusinessApi.settlementDashboard(id,apiKey),walletBusinessApi.riskDashboard(id,apiKey)])
   if(s.status==='fulfilled')setSettlement(s.value)
   if(r.status==='fulfilled')setRisk(r.value)
   setDashboardNotice(s.status==='rejected'||r.status==='rejected'?'P3 扩展看板尚未部署；P0 钱包资金流仍可正常验收。':'')
   return true
  }catch(e){setError(e instanceof Error?e.message:'读取业务数据失败');return false}finally{setBusy('')}
 }
 const connect=async()=>{setBusy('connect');setError('');setDashboardNotice('');setNeedsSandbox(false);try{setAdminKey(key);const rows=await walletBusinessApi.tenants(key);const sandbox=rows.filter(x=>x.environment==='SANDBOX');setTenants(sandbox);const id=sandbox.some(x=>x.id===tenantId)?tenantId:(sandbox[0]?.id||'');if(!id){setTenantId('');setNeedsSandbox(true);return}setTenantId(id);sessionStorage.setItem('fastlink_wallet_tenant',id);const loaded=await loadData(id,key);if(loaded)notify('Sandbox Admin API 已连接')}catch(e){setError(e instanceof Error?e.message:'连接失败')}finally{setBusy('')}}
 const createSandbox=async()=>{
  if(!key)return
  setBusy('sandbox');setError('')
  try{const created=await walletBusinessApi.createSandboxTenant(key,`fastlink-sandbox-${Date.now().toString(36)}`);setTenants([created]);setTenantId(created.id);setNeedsSandbox(false);sessionStorage.setItem('fastlink_wallet_tenant',created.id);const loaded=await loadData(created.id,key);if(loaded)notify('Sandbox 租户已创建并连接')}
  catch(e){setError(e instanceof Error?e.message:'创建 Sandbox 租户失败')}finally{setBusy('')}
 }
 useEffect(()=>{if(key)void connect()},[])
 const chooseTenant=(id:string)=>{setTenantId(id);sessionStorage.setItem('fastlink_wallet_tenant',id);void loadData(id,key)}
 const runAcceptance=async()=>{
  if(!tenantId||!key){setError('请先连接 Admin API 并选择 Sandbox 租户');return}
  setBusy('flow');setError('');setRunLog([])
  const stamp=Date.now().toString(36)
  const log=(text:string)=>setRunLog(v=>[...v,text])
  try{
   const a=await walletBusinessApi.createWallet(tenantId,key,'acceptance-a','Acceptance Wallet A');log(`✓ 创建 Wallet A · ${a.id}`)
   const b=await walletBusinessApi.createWallet(tenantId,key,'acceptance-b','Acceptance Wallet B');log(`✓ 创建 Wallet B · ${b.id}`)
   const deposit=await walletBusinessApi.deposit(tenantId,key,a.id,'1000',`accept:${stamp}:deposit`);log(`✓ Deposit 1,000 USD · Journal ${deposit.operation.journalIds[0]}`)
   const transfer=await walletBusinessApi.transfer(tenantId,key,a.id,b.id,'250',`accept:${stamp}:transfer`);log(`✓ Internal Transfer 250 USD · Journal ${transfer.operation.journalIds[0]}`)
   const withdraw=await walletBusinessApi.withdraw(tenantId,key,b.id,'100',`accept:${stamp}:withdraw`);log(`✓ Withdraw 100 USD → Pending Settlement`)
   const settled=await walletBusinessApi.settleWithdrawal(tenantId,key,withdraw.operation.id,`accept:${stamp}:settle`);log(`✓ Settlement completed · ${settled.operation.journalIds.length} Journals`)
   await walletBusinessApi.reserve(tenantId,key,'100','100',`accept:${stamp}:reserve`);log('✓ Sponsor Reserve 100 USD · Liquidity Ratio 100%')
   await loadData(tenantId,key);notify('钱包资金闭环验收成功')
  }catch(e){const message=e instanceof Error?e.message:'业务流失败';setError(message);log(`✗ ${message}`)}finally{setBusy('')}
 }
 return <div className="wbc-overlay"><div className="wbc-window">
  <header className="wbc-head"><div><span>FASTLINK P0 BUSINESS CONTROL</span><h2>Wallet · Ledger · Treasury</h2><p>真实 Sandbox 资金闭环与双重记账验收台</p></div><div><button onClick={onOpenLegacy}>传统 Treasury</button><button onClick={onClose}><X/></button></div></header>
  <main className="wbc-body">
   <section className="wbc-connect"><KeyRound/><input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Railway ADMIN_API_KEY（仅保存于本次浏览器会话）"/><button onClick={()=>void connect()} disabled={!key||!!busy}>{busy==='connect'?'连接中…':'连接'}</button><select value={tenantId} onChange={e=>chooseTenant(e.target.value)}><option value="">选择 Sandbox 租户</option>{tenants.map(t=><option value={t.id} key={t.id}>{t.brandName} · {t.id}</option>)}</select><button onClick={()=>void(tenantId?loadData():connect())} disabled={!key||!!busy}><RefreshCw/>{tenantId?'刷新':'连接并刷新'}</button></section>
   {error&&<div className="wbc-error">{error}</div>}
   {needsSandbox&&<div className="wbc-sandbox-empty"><div><b>尚未创建 Sandbox 租户</b><span>先创建隔离的测试租户，再执行充值、转账、提现与清算。</span></div><button onClick={()=>void createSandbox()} disabled={!!busy}>{busy==='sandbox'?'创建中…':'一键创建 Sandbox 租户'}</button></div>}
   {dashboardNotice&&<div className="wbc-notice">{dashboardNotice}</div>}
   <section className="wbc-metrics"><article><WalletCards/><span>Available Balance</span><strong>USD {amount(position?.availableBalance||0)}</strong></article><article><Landmark/><span>Sponsor Reserve</span><strong>USD {amount(position?.sponsorReserve||0)}</strong></article><article><ArrowLeftRight/><span>Pending Settlement</span><strong>USD {amount(position?.pendingSettlement||0)}</strong></article><article><CheckCircle2/><span>Liquidity Ratio</span><strong>{position?.liquidityRatio??'—'}{position?.liquidityRatio?'%':''}</strong></article></section>
   <section className="wbc-run"><div><h3>完整业务流验收</h3><p>自动创建两个钱包并执行 Deposit 1,000 → Transfer 250 → Withdraw 100 → Settlement → Sponsor Reserve。</p></div><button onClick={()=>void runAcceptance()} disabled={!tenantId||busy==='flow'}>{busy==='flow'?<LoaderCircle className="spin"/>:<Play/>}{busy==='flow'?'执行中…':'运行完整资金流'}</button>{runLog.length>0&&<pre>{runLog.join('\n')}</pre>}</section>
   <Sprint09BusinessAcceptance tenantId={tenantId} apiKey={key} notify={notify}/>
   <CardProcessorAcceptance tenantId={tenantId} apiKey={key} notify={notify}/>
   <section className="wbc-grid"><article><h3>Wallet Accounts</h3><table><thead><tr><th>账户</th><th>客户</th><th>余额</th></tr></thead><tbody>{customerAccounts.map(x=><tr key={x.id}><td>{x.name}<small>{x.accountCode}</small></td><td>{x.customerId}</td><td>{amount(x.postedBalance)} {x.assetCode}</td></tr>)}</tbody></table></article><article><h3>Trial Balance</h3><table><thead><tr><th>资产</th><th>Debit</th><th>Credit</th><th>平衡</th></tr></thead><tbody>{trial.map(x=><tr key={x.assetCode}><td>{x.assetCode}</td><td>{amount(x.debit)}</td><td>{amount(x.credit)}</td><td className={x.balanced?'ok':'bad'}>{x.balanced?'BALANCED':'UNBALANCED'}</td></tr>)}</tbody></table></article></section>
   <section className="wbc-grid"><article><h3>Wallet Operations</h3><div className="wbc-list">{operations.slice(0,12).map(x=><div key={x.id}><b>{x.type}</b><span>{amount(x.amount)} {x.assetCode}</span><em className={x.status==='COMPLETED'?'ok':''}>{x.status}</em><small>{x.id}</small></div>)}</div></article><article><h3><BookOpenCheck/> Automatic Journals</h3><div className="wbc-list journals">{journals.slice(0,12).map(x=><div key={x.id}><b>{x.referenceType}</b><span>{x.entries.map(e=>`${e.side} ${amount(e.amount)}`).join(' · ')}</span><em>{x.entries.length} entries</em><small>{x.id}</small></div>)}</div></article></section>
   <section className="wbc-grid"><article><h3>Settlement Dashboard</h3><div className="wbc-dashboard-stats"><div><span>Pending</span><b>{settlement?.summary.pendingCount??0}</b></div><div><span>Completed</span><b>{settlement?.summary.completedCount??0}</b></div><div><span>Pending USD</span><b>{amount(settlement?.summary.pendingByAsset.USD??0)}</b></div><div><span>Failed</span><b>{settlement?.summary.failedCount??0}</b></div></div><div className="wbc-list">{settlement?.withdrawals.slice(0,8).map(x=><div key={x.id}><b>WITHDRAWAL</b><span>{amount(x.amount)} {x.assetCode}</span><em className={x.status==='COMPLETED'?'ok':''}>{x.status}</em><small>{x.journalIds.length} Journals · {x.id}</small></div>)}</div></article><article><h3>Risk Dashboard</h3><div className="wbc-dashboard-stats"><div><span>Transactions</span><b>{risk?.summary.transactionCount??0}</b></div><div><span>Decline Rate</span><b>{risk?.summary.declineRate??0}%</b></div><div><span>High Value</span><b>{risk?.summary.highValueCount??0}</b></div><div><span>Frozen Cards</span><b>{risk?.summary.frozenCards??0}</b></div></div><div className="wbc-list">{risk?.alerts.slice(0,8).map((x,i)=><div key={`${x.type}-${x.transactionId}-${i}`}><b>{x.type}</b><span>{(Number(x.amountMinor)/100).toFixed(2)} {x.currency}</span><em className={x.severity==='HIGH'?'risk-high':''}>{x.severity}</em><small>{x.transactionId} · {x.cardId}</small></div>)}</div></article></section>
  </main>
 </div></div>
}
