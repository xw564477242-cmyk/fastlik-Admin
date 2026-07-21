import {useMemo,useState} from 'react'
import {Activity,AlertTriangle,CheckCircle2,CreditCard,Download,Landmark,RefreshCw,Search,ShieldCheck,Webhook} from 'lucide-react'
import {createSprint06DemoData,downloadCsv} from './sprint06DemoData'

type DashboardId='treasury'|'settlement'|'risk'|'card'|'transaction'|'webhook'
type Props={notify:(message:string)=>void}
const tabs:Array<{id:DashboardId;label:string;icon:typeof Activity}>=[
 {id:'treasury',label:'Treasury',icon:Landmark},{id:'settlement',label:'Settlement',icon:RefreshCw},{id:'risk',label:'Risk',icon:ShieldCheck},{id:'card',label:'Card',icon:CreditCard},{id:'transaction',label:'Transaction',icon:Activity},{id:'webhook',label:'Webhook',icon:Webhook},
]
const money=(value:number,currency='USD')=>`${currency} ${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function BusinessOperationsDashboard({notify}:Props){
 const data=useMemo(()=>createSprint06DemoData(),[])
 const[active,setActive]=useState<DashboardId>('treasury')
 const[query,setQuery]=useState('')
 const[status,setStatus]=useState('ALL')
 const[currency,setCurrency]=useState('ALL')
 const[updatedAt,setUpdatedAt]=useState(new Date())
 const treasury=useMemo(()=>['USD','EUR','GBP','MYR','SGD','USDT'].map((asset,index)=>{
  const wallets=data.users.filter(user=>user.currency===asset).reduce((sum,user)=>sum+user.walletBalance,0)
  const pending=data.transactions.filter(row=>row.currency===asset&&row.status==='PENDING').reduce((sum,row)=>sum+row.amount,0)
  const reserve=Number((wallets*(0.18+(index%3)*0.02)).toFixed(2))
  return {asset,available:Number((wallets-reserve-pending).toFixed(2)),sponsorReserve:reserve,pendingSettlement:Number(pending.toFixed(2)),liquidityRatio:Number(((reserve/Math.max(pending,1))*100).toFixed(1)),status:reserve>pending?'HEALTHY':'WATCH'}
 }),[data])
 const riskRows=useMemo(()=>data.transactions.filter(row=>row.status==='DECLINED'||row.riskScore>=75).slice(0,300),[data])
 const filter=(row:Record<string,unknown>)=>{const text=Object.values(row).join(' ').toLowerCase();const rowStatus=String(row.status||'');const rowCurrency=String(row.currency||row.asset||'');return text.includes(query.toLowerCase())&&(status==='ALL'||rowStatus===status)&&(currency==='ALL'||rowCurrency===currency)}
 const rows=useMemo(()=>{
  const source:Record<DashboardId,Array<Record<string,unknown>>>={treasury,settlement:data.settlements,risk:riskRows,card:data.cards,transaction:data.transactions.slice(0,1000),webhook:data.webhooks}
  return source[active].filter(filter)
 },[active,currency,data.cards,data.settlements,data.transactions,data.webhooks,query,riskRows,status,treasury])
 const exportRows=()=>{downloadCsv(`fastlink-${active}-${new Date().toISOString().slice(0,10)}.csv`,rows.map(row=>Object.fromEntries(Object.entries(row).filter(([,value])=>['string','number'].includes(typeof value))) as Record<string,string|number>));notify(`${active} 数据已导出`)}
 const totalVolume=data.transactions.reduce((sum,row)=>sum+row.amount,0)
 const declined=data.transactions.filter(row=>row.status==='DECLINED').length
 const pendingSettlements=data.settlements.filter(row=>row.status==='PENDING').reduce((sum,row)=>sum+row.amount,0)
 const webhookFailures=data.webhooks.filter(row=>row.status==='FAILED').length

 return <div className="s06-page">
  <div className="s06-page-head"><div><span>SPRINT‑06 · ADMIN OPERATIONS</span><h2>业务运营与 UAT Readiness Dashboard</h2><p>统一查看资金、清算、风险、卡片、交易与 Webhook；全部数据支持搜索、筛选和 CSV 导出。</p></div><div className="s06-mode"><i/> DEMO DATA READY</div></div>
  <section className="s06-demo-banner"><div><strong>1,000</strong><span>模拟用户</span></div><div><strong>10,000</strong><span>模拟交易</span></div><div><strong>100</strong><span>虚拟卡 / 实体卡</span></div><div><strong>6</strong><span>多币种资产</span></div><p>最后刷新：{updatedAt.toLocaleTimeString('zh-CN',{hour12:false})}</p><button onClick={()=>{setUpdatedAt(new Date());notify('所有运营看板已刷新')}}><RefreshCw/>刷新</button></section>
  <section className="s06-admin-metrics"><article><Landmark/><span>总交易规模</span><strong>{money(totalVolume)}</strong><small>10,000 笔 Mock 授权</small></article><article><RefreshCw/><span>待清算</span><strong>{money(pendingSettlements)}</strong><small>{data.settlements.filter(row=>row.status==='PENDING').length} 个批次</small></article><article><AlertTriangle/><span>拒绝率</span><strong>{(declined/data.transactions.length*100).toFixed(2)}%</strong><small>{declined} 笔需要复核</small></article><article><Webhook/><span>Webhook 异常</span><strong>{webhookFailures}</strong><small>支持搜索及导出</small></article></section>
  <nav className="s06-dashboard-tabs">{tabs.map(({id,label,icon:Icon})=><button key={id} className={active===id?'active':''} onClick={()=>{setActive(id);setStatus('ALL');setCurrency('ALL')}}><Icon/>{label} Dashboard</button>)}</nav>
  <article className="panel s06-dashboard-panel"><div className="s06-tools"><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={`搜索 ${active} 数据…`}/></label><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">全部状态</option>{['ACTIVE','FROZEN','PENDING','COMPLETED','FAILED','APPROVED','DECLINED','DELIVERED','RETRYING','HEALTHY','WATCH'].map(value=><option key={value}>{value}</option>)}</select><select value={currency} onChange={event=>setCurrency(event.target.value)}><option value="ALL">全部币种</option>{['USD','EUR','GBP','MYR','SGD','USDT'].map(value=><option key={value}>{value}</option>)}</select><span>{rows.length.toLocaleString()} 条结果</span><button onClick={exportRows}><Download/>导出 CSV</button></div>
   {active==='treasury'&&<table><thead><tr><th>资产</th><th>Available Balance</th><th>Sponsor Reserve</th><th>Pending Settlement</th><th>Liquidity Ratio</th><th>状态</th></tr></thead><tbody>{rows.map((value:any)=><tr key={value.asset}><td><b>{value.asset}</b></td><td>{money(value.available,value.asset)}</td><td>{money(value.sponsorReserve,value.asset)}</td><td>{money(value.pendingSettlement,value.asset)}</td><td>{value.liquidityRatio}%</td><td><Badge value={value.status}/></td></tr>)}</tbody></table>}
   {active==='settlement'&&<table><thead><tr><th>批次</th><th>资产</th><th>金额</th><th>交易数</th><th>预计时间</th><th>状态</th></tr></thead><tbody>{rows.map((value:any)=><tr key={value.id}><td><b>{value.id}</b></td><td>{value.currency}</td><td>{money(value.amount,value.currency)}</td><td>{value.transactionCount}</td><td>{String(value.expectedAt).slice(0,16).replace('T',' ')}</td><td><Badge value={value.status}/></td></tr>)}</tbody></table>}
   {active==='risk'&&<table><thead><tr><th>交易</th><th>卡片 / 用户</th><th>商户</th><th>金额</th><th>Risk Score</th><th>状态</th></tr></thead><tbody>{rows.map((value:any)=><tr key={value.id}><td><b>{value.id}</b><small>{value.createdAt.slice(0,10)}</small></td><td>{value.cardId}<small>{value.userId}</small></td><td>{value.merchant}</td><td>{money(value.amount,value.currency)}</td><td className={value.riskScore>=80?'s06-risk-high':''}>{value.riskScore}</td><td><Badge value={value.status}/></td></tr>)}</tbody></table>}
   {active==='card'&&<table><thead><tr><th>卡片</th><th>持卡人</th><th>类型</th><th>币种</th><th>余额</th><th>状态</th></tr></thead><tbody>{rows.map((value:any)=><tr key={value.id}><td><b>{value.maskedPan}</b><small>{value.id}</small></td><td>{value.holder}<small>{value.userId}</small></td><td>{value.type}</td><td>{value.currency}</td><td>{money(value.balance,value.currency)}</td><td><Badge value={value.status}/></td></tr>)}</tbody></table>}
   {active==='transaction'&&<table><thead><tr><th>交易</th><th>商户</th><th>卡片</th><th>类型</th><th>金额</th><th>状态</th><th>时间</th></tr></thead><tbody>{rows.slice(0,250).map((value:any)=><tr key={value.id}><td><b>{value.id}</b></td><td>{value.merchant}<small>{value.country}</small></td><td>{value.cardId}</td><td>{value.type}</td><td>{money(value.amount,value.currency)}</td><td><Badge value={value.status}/></td><td>{value.createdAt.slice(0,16).replace('T',' ')}</td></tr>)}</tbody></table>}
   {active==='webhook'&&<table><thead><tr><th>事件</th><th>Event ID</th><th>目标端点</th><th>Attempts</th><th>状态</th><th>时间</th></tr></thead><tbody>{rows.map((value:any)=><tr key={value.id}><td><b>{value.event}</b></td><td>{value.id}</td><td>{value.endpoint}</td><td>{value.attempts}</td><td><Badge value={value.status}/></td><td>{value.occurredAt.slice(0,16).replace('T',' ')}</td></tr>)}</tbody></table>}
   {!rows.length&&<div className="s06-empty"><CheckCircle2/>当前筛选条件没有记录，请调整搜索或筛选项。</div>}
  </article>
 </div>
}

function Badge({value}:{value:string}){return <span className={`s06-status ${value.toLowerCase()}`}>{value}</span>}
