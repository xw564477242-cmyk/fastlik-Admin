import {FormEvent,useMemo,useState} from 'react'
import {Activity,AlertTriangle,BookOpen,CheckCircle2,Database,Download,FileJson,KeyRound,Landmark,Link2,RefreshCw,Search,ShieldCheck,Store,Unplug,WalletCards} from 'lucide-react'
import {exportCsv,exportExcel,exportPdf} from './exporters'
import {DEFAULT_API,productionApi,type Contamination,type DataSource,type Health,type Journal,type Merchant,type MerchantPayment,type Reconciliation,type Tenant,type TraceReport,type TreasuryPosition,type TrialBalance,type WalletAccount} from './productionApi'

type Tab='readiness'|'treasury'|'ledger'|'settlement'|'merchant'|'trace'
type Snapshot={health:Health;contamination:Contamination;treasury:TreasuryPosition[];trial:TrialBalance[];reconciliation:Reconciliation;accounts:WalletAccount[];journals:Journal[];merchants:Merchant[];payments:MerchantPayment[];loadedAt:string}
const tabs:Array<{id:Tab;label:string;icon:typeof Activity}>=[
 {id:'readiness',label:'Readiness',icon:ShieldCheck},{id:'treasury',label:'Treasury',icon:Landmark},{id:'ledger',label:'Ledger',icon:BookOpen},
 {id:'settlement',label:'Settlement',icon:RefreshCw},{id:'merchant',label:'Merchant',icon:Store},{id:'trace',label:'Trace ID',icon:Link2},
]
const sources:DataSource[]=['SANDBOX','UAT','PRODUCTION']
const flat=(rows:Array<Record<string,unknown>>)=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='object'&&value!==null?JSON.stringify(value):value])))

export default function ProductionConsole(){
 const[base,setBase]=useState(DEFAULT_API)
 const[keyInput,setKeyInput]=useState('')
 const[secret,setSecret]=useState('')
 const[source,setSource]=useState<DataSource>('SANDBOX')
 const[tenants,setTenants]=useState<Tenant[]>([])
 const[tenantId,setTenantId]=useState('')
 const[active,setActive]=useState<Tab>('readiness')
 const[snapshot,setSnapshot]=useState<Snapshot|null>(null)
 const[traceId,setTraceId]=useState('')
 const[trace,setTrace]=useState<TraceReport|null>(null)
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const[notice,setNotice]=useState('')
 const selectedTenant=useMemo(()=>tenants.find(row=>row.id===tenantId),[tenantId,tenants])
 const trialBalanced=snapshot?.trial.every(row=>row.balanced)??false
 const gate=snapshot&&snapshot.health.status==='ok'&&snapshot.contamination.status==='CLEAN'&&trialBalanced&&snapshot.reconciliation.status==='MATCHED'?'PASS':'OPEN'

 const connect=async(event?:FormEvent)=>{
  event?.preventDefault();setBusy('connect');setError('');setNotice('');setSnapshot(null);setTrace(null)
  try{
   const health=await productionApi.health(base)
   if(source==='UAT'){
    setSecret('');setTenants([]);setTenantId('')
    setNotice(`API ${health.release} 可用，但后端尚未配置独立 UAT 数据源；已禁止回退 Sandbox。`)
    return
   }
   if(keyInput.length<32)throw new Error('ADMIN_API_KEY 至少需要 32 个字符')
   const rows=(await productionApi.tenants(base,keyInput)).filter(row=>row.environment===source)
   if(!rows.length)throw new Error(`${source} 没有可用租户；不会使用其他数据源代替`)
   setSecret(keyInput);setKeyInput('');setTenants(rows);setTenantId(rows[0].id)
   setNotice(`已连接 ${health.service} · Release ${health.release}`)
   await load(rows[0].id,keyInput)
  }catch(value){setError(value instanceof Error?value.message:'连接失败');setSecret('');setTenants([]);setTenantId('')}
  finally{setBusy('')}
 }

 const load=async(id=tenantId,key=secret)=>{
  if(!id||!key)return
  setBusy('load');setError('');setSnapshot(null);setTrace(null)
  try{
   const[health,contamination,treasury,trial,reconciliation,accounts,journals,merchants,payments]=await Promise.all([
    productionApi.health(base),productionApi.contamination(base,key,id,source),productionApi.treasury(base,key,id,source),productionApi.trialBalance(base,key,id,source),
    productionApi.reconciliation(base,key,id,source),productionApi.accounts(base,key,id,source),productionApi.journals(base,key,id,source),
    productionApi.merchants(base,key,id,source),productionApi.merchantPayments(base,key,id,source),
   ])
   setSnapshot({health,contamination,treasury:treasury.positions,trial,reconciliation,accounts,journals,merchants:merchants.data,payments:payments.data,loadedAt:new Date().toISOString()})
  }catch(value){setError(value instanceof Error?value.message:'读取生产数据失败')}
  finally{setBusy('')}
 }

 const chooseSource=(next:DataSource)=>{setSource(next);setSecret('');setKeyInput('');setTenants([]);setTenantId('');setSnapshot(null);setTrace(null);setError('');setNotice(next==='UAT'?'UAT 必须配置真实数据源；本页面不会回退 Sandbox。':'')}
 const disconnect=()=>{setSecret('');setKeyInput('');setTenants([]);setTenantId('');setSnapshot(null);setTrace(null);setNotice('连接已清除；密钥未写入浏览器存储。')}
 const searchTrace=async(event:FormEvent)=>{event.preventDefault();if(!tenantId||!secret)return;setBusy('trace');setError('');setTrace(null);try{setTrace(await productionApi.trace(base,secret,tenantId,source,traceId.trim()))}catch(value){setError(value instanceof Error?value.message:'Trace 查询失败')}finally{setBusy('')}}
 const exportRows=(name:string,rows:Array<Record<string,unknown>>,format:'csv'|'xls'|'pdf')=>{if(!rows.length){setError('当前没有可导出的真实数据');return}if(format==='csv')exportCsv(name,flat(rows));else if(format==='xls')exportExcel(name,flat(rows));else exportPdf(name,flat(rows))}

 return <div className="prod-app">
  <header className="prod-top"><div className="prod-brand"><span>F</span><div><b>FastLink</b><small>PRODUCTION READINESS CONTROL</small></div></div><div className="source-control"><strong>Data Source:</strong>{sources.map(value=><button key={value} className={source===value?'active':''} onClick={()=>chooseSource(value)}>{value}</button>)}</div><div className={`connection ${secret?'online':'offline'}`}><i/>{secret?`${source} CONNECTED`:'NOT CONNECTED'}</div></header>
  <section className="connection-panel">
   <div><span>SPRINT‑12 · NO MOCK FALLBACK</span><h1>Production Readiness Console</h1><p>所有数字只来自所选 FastLink API。连接失败、无租户或 UAT 未配置时显示错误，不生成替代数据。</p></div>
   <form onSubmit={connect}><label>API Base<input value={base} onChange={event=>setBase(event.target.value)} spellCheck={false}/></label><label>ADMIN_API_KEY<div><KeyRound/><input type="password" value={keyInput} onChange={event=>setKeyInput(event.target.value)} autoComplete="off" placeholder="仅保存在当前内存，连接后立即清空输入"/></div></label><button disabled={busy==='connect'||source==='UAT'}>{busy==='connect'?'连接中…':'连接真实 API'}</button>{secret&&<button type="button" className="secondary" onClick={disconnect}><Unplug/>断开</button>}</form>
  </section>
  {(notice||error)&&<div className={`prod-message ${error?'error':''}`}>{error||notice}</div>}
  <div className="prod-context"><label>Tenant<select value={tenantId} disabled={!secret} onChange={event=>{setTenantId(event.target.value);void load(event.target.value)}}><option value="">选择真实租户</option>{tenants.map(row=><option key={row.id} value={row.id}>{row.brandName} · {row.id}</option>)}</select></label><span><Database/>Data Source: <b>{source}</b></span><span>Tenant: <b>{selectedTenant?.brandName||'—'}</b></span><span>Release: <b>{snapshot?.health.release||'—'}</b></span><button disabled={!secret||!!busy} onClick={()=>void load()}><RefreshCw/>刷新</button></div>
  <nav className="prod-tabs">{tabs.map(({id,label,icon:Icon})=><button key={id} className={active===id?'active':''} onClick={()=>setActive(id)}><Icon/>{label}</button>)}</nav>
  <main className="prod-main">
   <section className="data-heading"><div><span>Data Source: {source}</span><h2>{tabs.find(row=>row.id===active)?.label} Dashboard</h2><p>{snapshot?`Last loaded ${new Date(snapshot.loadedAt).toLocaleString()}`:'请先连接并选择真实租户。'}</p></div>{snapshot&&<strong className={gate==='PASS'?'pass':'open'}>Release Gate: {gate}</strong>}</section>
   {!snapshot&&active!=='trace'&&<Empty source={source}/>} 
   {snapshot&&active==='readiness'&&<Readiness snapshot={snapshot} gate={gate}/>} 
   {snapshot&&active==='treasury'&&<Treasury rows={snapshot.treasury} onExport={(format)=>exportRows(`fastlink-${source.toLowerCase()}-treasury`,snapshot.treasury as unknown as Array<Record<string,unknown>>,format)}/>} 
   {snapshot&&active==='ledger'&&<Ledger accounts={snapshot.accounts} trial={snapshot.trial} journals={snapshot.journals} onExport={(format)=>exportRows(`fastlink-${source.toLowerCase()}-ledger`,snapshot.journals as unknown as Array<Record<string,unknown>>,format)}/>} 
   {snapshot&&active==='settlement'&&<Settlement value={snapshot.reconciliation} onExport={(format)=>exportRows(`fastlink-${source.toLowerCase()}-settlement`,snapshot.reconciliation.pendingChecks as unknown as Array<Record<string,unknown>>,format)}/>} 
   {snapshot&&active==='merchant'&&<MerchantDashboard merchants={snapshot.merchants} payments={snapshot.payments} onExport={(rows,format)=>exportRows(`fastlink-${source.toLowerCase()}-merchant`,rows,format)}/>} 
   {active==='trace'&&<TraceDashboard source={source} connected={Boolean(secret&&tenantId)} traceId={traceId} setTraceId={setTraceId} busy={busy} report={trace} submit={searchTrace} onExport={(format)=>trace&&exportRows(`fastlink-${source.toLowerCase()}-trace-${trace.traceId}`,[trace as unknown as Record<string,unknown>],format)}/>} 
  </main>
 </div>
}

function Empty({source}:{source:DataSource}){return <section className="empty-state"><Database/><h3>Data Source: {source}</h3><p>没有加载任何数据，也没有 Mock 回退。</p></section>}
function Badge({ok,label}:{ok:boolean;label:string}){return <span className={ok?'badge ok':'badge bad'}>{ok?<CheckCircle2/>:<AlertTriangle/>}{label}</span>}
function ExportButtons({run}:{run:(format:'csv'|'xls'|'pdf')=>void}){return <div className="exports"><button onClick={()=>run('csv')}><Download/>CSV</button><button onClick={()=>run('xls')}><FileJson/>Excel</button><button onClick={()=>run('pdf')}><FileJson/>PDF</button></div>}

function Readiness({snapshot,gate}:{snapshot:Snapshot;gate:string}){const cards=[['Health',snapshot.health.status==='ok',`${snapshot.health.checks.database} / ${snapshot.health.checks.schema}`],['Mock contamination',snapshot.contamination.status==='CLEAN',`${snapshot.contamination.total} records`],['Trial Balance',snapshot.trial.every(row=>row.balanced),`${snapshot.trial.length} assets`],['Reconciliation',snapshot.reconciliation.status==='MATCHED',snapshot.reconciliation.status]] as const;return <><section className="metric-grid">{cards.map(([label,ok,detail])=><article key={label}><Badge ok={ok} label={ok?'PASS':'FAIL'}/><span>{label}</span><strong>{detail}</strong></article>)}</section><section className="panel"><h3>Go Live Decision</h3><p className="gate-copy">Environment-backed checks: <b>{gate}</b>. The overall CTO gate remains OPEN until coverage, load, chaos, backup and rollback evidence are attached.</p><div className="count-grid">{Object.entries(snapshot.contamination.counts).map(([key,value])=><div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div></section></>}
function Treasury({rows,onExport}:{rows:TreasuryPosition[];onExport:(format:'csv'|'xls'|'pdf')=>void}){return <section className="panel"><div className="panel-head"><div><h3>Treasury Positions</h3><p>Available、Authorization Hold、Reserve 与 Pending Settlement 来自实时账务库。</p></div><ExportButtons run={onExport}/></div><table><thead><tr><th>Asset</th><th>Available</th><th>Authorization Hold</th><th>Sponsor Reserve</th><th>Required Reserve</th><th>Pending Settlement</th><th>Liquidity</th></tr></thead><tbody>{rows.map(row=><tr key={row.assetCode}><td><b>{row.assetCode}</b></td><td>{row.availableBalance}</td><td>{row.authorizationHold}</td><td>{row.sponsorReserve}</td><td>{row.requiredReserve}</td><td>{row.pendingSettlement}</td><td>{row.liquidityRatio??'—'}</td></tr>)}</tbody></table></section>}
function Ledger({accounts,trial,journals,onExport}:{accounts:WalletAccount[];trial:TrialBalance[];journals:Journal[];onExport:(format:'csv'|'xls'|'pdf')=>void}){return <><section className="panel"><div className="panel-head"><div><h3>Trial Balance</h3><p>每个资产必须 Debit = Credit。</p></div><ExportButtons run={onExport}/></div><table><thead><tr><th>Asset</th><th>Debit</th><th>Credit</th><th>Result</th></tr></thead><tbody>{trial.map(row=><tr key={row.assetCode}><td>{row.assetCode}</td><td>{row.debit}</td><td>{row.credit}</td><td><Badge ok={row.balanced} label={row.balanced?'BALANCED':'UNBALANCED'}/></td></tr>)}</tbody></table></section><section className="two-col"><article className="panel"><h3>Accounts ({accounts.length})</h3>{accounts.slice(0,50).map(row=><div className="line" key={row.id}><div><b>{row.accountCode}</b><small>{row.purpose} · {row.assetCode}</small></div><span>{row.postedBalance}<small>hold {row.pendingBalance}</small></span></div>)}</article><article className="panel"><h3>Recent Journals ({journals.length})</h3>{journals.slice(0,50).map(row=><div className="line" key={row.id}><div><b>{row.referenceType}</b><small>{row.id} · {row.entries.length} entries</small></div><span>{row.status}<small>{new Date(row.postedAt).toLocaleString()}</small></span></div>)}</article></section></>}
function Settlement({value,onExport}:{value:Reconciliation;onExport:(format:'csv'|'xls'|'pdf')=>void}){return <section className="panel"><div className="panel-head"><div><h3>Reconciliation · {value.status}</h3><p>Withdrawal、Merchant、Card Clearing 与 Authorization Hold 均纳入。</p></div><ExportButtons run={onExport}/></div><table><thead><tr><th>Asset</th><th>Expected Pending</th><th>Treasury Pending</th><th>Difference</th><th>Result</th></tr></thead><tbody>{value.pendingChecks.map(row=><tr key={row.assetCode}><td>{row.assetCode}</td><td>{row.expectedPendingSettlement}</td><td>{row.treasuryPendingSettlement}</td><td>{row.difference}</td><td><Badge ok={row.matched} label={row.matched?'MATCHED':'MISMATCH'}/></td></tr>)}</tbody></table><h3 className="subhead">Authorization Hold</h3><table><thead><tr><th>Asset</th><th>Expected Hold</th><th>Treasury Hold</th><th>Difference</th><th>Result</th></tr></thead><tbody>{value.authorizationHoldChecks.map(row=><tr key={row.assetCode}><td>{row.assetCode}</td><td>{row.expectedAuthorizationHold}</td><td>{row.treasuryAuthorizationHold}</td><td>{row.difference}</td><td><Badge ok={row.matched} label={row.matched?'MATCHED':'MISMATCH'}/></td></tr>)}</tbody></table></section>}
function MerchantDashboard({merchants,payments,onExport}:{merchants:Merchant[];payments:MerchantPayment[];onExport:(rows:Array<Record<string,unknown>>,format:'csv'|'xls'|'pdf')=>void}){return <><section className="panel"><div className="panel-head"><div><h3>Merchant Profiles ({merchants.length})</h3><p>真实 Merchant 与 Settlement Asset 关联。</p></div><ExportButtons run={format=>onExport(merchants as unknown as Array<Record<string,unknown>>,format)}/></div><table><thead><tr><th>Merchant</th><th>External ID</th><th>MCC</th><th>Settlement Asset</th><th>Status</th></tr></thead><tbody>{merchants.map(row=><tr key={row.id}><td><b>{row.name}</b><small>{row.id}</small></td><td>{row.externalMerchantId}</td><td>{row.mcc}</td><td>{row.settlementAssetCode}</td><td>{row.status}</td></tr>)}</tbody></table></section><section className="panel"><div className="panel-head"><div><h3>Payment History ({payments.length})</h3><p>Wallet、Card、Journal 与 Settlement Batch 引用。</p></div><ExportButtons run={format=>onExport(payments as unknown as Array<Record<string,unknown>>,format)}/></div><table><thead><tr><th>Payment</th><th>Merchant</th><th>Wallet / Card</th><th>Amount</th><th>Journals</th><th>Status</th></tr></thead><tbody>{payments.map(row=><tr key={row.id}><td><b>{row.id}</b><small>{new Date(row.createdAt).toLocaleString()}</small></td><td>{row.merchant?.name||row.merchantId}</td><td>{row.walletAccountId}<small>{row.cardId||'Wallet only'}</small></td><td>{row.amount} {row.assetCode}</td><td>{row.journalIds.length}</td><td>{row.status}</td></tr>)}</tbody></table></section></>}
function TraceDashboard({source,connected,traceId,setTraceId,busy,report,submit,onExport}:{source:DataSource;connected:boolean;traceId:string;setTraceId:(value:string)=>void;busy:string;report:TraceReport|null;submit:(event:FormEvent)=>void;onExport:(format:'csv'|'xls'|'pdf')=>void}){const sections=report?Object.entries(report.summary):[];return <><section className="panel trace-search"><div><span>Data Source: {source}</span><h3>End-to-End Trace ID</h3><p>Customer → Wallet → Card → Journal → Treasury → Settlement → Webhook → Audit</p></div><form onSubmit={submit}><Search/><input value={traceId} onChange={event=>setTraceId(event.target.value)} placeholder="输入 8–128 位 Trace ID"/><button disabled={!connected||busy==='trace'}>{busy==='trace'?'查询中…':'查询'}</button></form></section>{report&&<><section className="panel-head trace-result"><div><h3>{report.traceId}</h3><p>{report.environment} · {new Date(report.generatedAt).toLocaleString()}</p></div><div><Badge ok={report.status==='CONSISTENT'} label={report.status}/><ExportButtons run={onExport}/></div></section><section className="count-grid">{sections.map(([key,value])=><div key={key}><span>{key}</span><strong>{value}</strong></div>)}</section><section className="panel"><h3>Trace Checks</h3><div className="check-row">{Object.entries(report.checks).map(([key,value])=><Badge key={key} ok={value} label={key}/>)}</div><details><summary>查看脱敏 Trace JSON</summary><pre>{JSON.stringify(report,null,2)}</pre></details></section></>}</>}
