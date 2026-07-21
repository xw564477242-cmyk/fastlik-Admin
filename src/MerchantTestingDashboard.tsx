import {useMemo,useState} from 'react'
import {Activity,Building2,CheckCircle2,CreditCard,Download,Search,WalletCards} from 'lucide-react'
import {downloadCsv} from './sprint06DemoData'
import {createSprint07DemoData} from './sprint07DemoData'

type Tab='merchants'|'cards'|'wallets'|'transactions'
type Props={notify:(message:string)=>void}
const money=(value:number,currency='USD')=>`${currency} ${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function MerchantTestingDashboard({notify}:Props){
 const data=useMemo(()=>createSprint07DemoData(),[])
 const[tab,setTab]=useState<Tab>('merchants')
 const[query,setQuery]=useState('')
 const[status,setStatus]=useState('ALL')
 const[currency,setCurrency]=useState('ALL')
 const regionCount=new Set(data.merchants.map(row=>row.region)).size
 const source:Record<Tab,Array<Record<string,unknown>>>={merchants:data.merchants,cards:data.cards,wallets:data.wallets,transactions:data.transactions}
 const rows=useMemo(()=>source[tab].filter(row=>{const text=Object.values(row).join(' ').toLowerCase();return text.includes(query.toLowerCase())&&(status==='ALL'||row.status===status)&&(currency==='ALL'||(row.currency||row.settlementCurrency)===currency)}),[currency,query,status,tab])
 const exportRows=()=>{downloadCsv(`fastlink-testing-${tab}.csv`,rows.map(row=>Object.fromEntries(Object.entries(row).filter(([,value])=>['string','number'].includes(typeof value))) as Record<string,string|number>));notify(`${tab} 验收数据已导出`)}
 const volume=data.transactions.reduce((sum,row)=>sum+row.amount,0)
 const approved=data.transactions.filter(row=>row.status==='APPROVED').length

 return <div className="s07-page">
  <header className="s07-head merchant"><div><span>SPRINT‑07 · MERCHANT / TESTING DASHBOARD</span><h2>商户与大规模 Mock 验收中心</h2><p>100 商户、500 卡片、1,000 钱包、10,000 交易；支持搜索、筛选、CSV 与演示验证。</p></div><div className="s07-adapter mock"><i/>DETERMINISTIC MOCK</div></header>
  <section className="s07-acceptance-strip"><div><CheckCircle2/><strong>100</strong><span>Merchants</span></div><div><CheckCircle2/><strong>500</strong><span>Cards</span></div><div><CheckCircle2/><strong>1,000</strong><span>Wallets</span></div><div><CheckCircle2/><strong>10,000</strong><span>Transactions</span></div><p>验收数据已就绪 · {regionCount} 个区域 · 6 种币种</p></section>
  <section className="s07-metrics"><article><Building2/><span>活跃商户</span><strong>{data.merchants.filter(row=>row.status==='ACTIVE').length}</strong><small>共 100 个 Sandbox 商户</small></article><article><Activity/><span>交易规模</span><strong>{money(volume)}</strong><small>Mock 业务总额</small></article><article><CheckCircle2/><span>授权成功率</span><strong>{(approved/data.transactions.length*100).toFixed(2)}%</strong><small>{approved.toLocaleString()} 笔 APPROVED</small></article><article><WalletCards/><span>钱包资产</span><strong>{money(data.wallets.reduce((sum,row)=>sum+row.balance,0))}</strong><small>多币种折算演示值</small></article></section>
  <nav className="s07-tabs">{([{id:'merchants',label:'Merchants',icon:Building2},{id:'cards',label:'Cards',icon:CreditCard},{id:'wallets',label:'Wallets',icon:WalletCards},{id:'transactions',label:'Transactions',icon:Activity}] as const).map(({id,label,icon:Icon})=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setStatus('ALL');setCurrency('ALL')}}><Icon/>{label}<em>{data[id].length.toLocaleString()}</em></button>)}</nav>
  <article className="panel s07-testing-table"><div className="s07-tools"><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={`搜索 ${tab}…`}/></label><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">全部状态</option>{['ACTIVE','REVIEW','SUSPENDED','FROZEN','PENDING','APPROVED','DECLINED'].map(value=><option key={value}>{value}</option>)}</select><select value={currency} onChange={event=>setCurrency(event.target.value)}><option value="ALL">全部币种</option>{['USD','EUR','GBP','MYR','SGD','USDT'].map(value=><option key={value}>{value}</option>)}</select><span>{rows.length.toLocaleString()} 条结果</span><button onClick={exportRows}><Download/>导出 CSV</button></div>
   {tab==='merchants'&&<table><thead><tr><th>商户</th><th>区域 / 行业</th><th>结算币种</th><th>月交易额</th><th>交易数</th><th>拒付率</th><th>状态</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.id}><td><b>{row.name}</b><small>{row.id}</small></td><td>{row.region}<small>{row.industry}</small></td><td>{row.settlementCurrency}</td><td>{money(row.monthlyVolume,row.settlementCurrency)}</td><td>{row.transactionCount}</td><td>{row.chargebackRate}%</td><td><Badge value={row.status}/></td></tr>)}</tbody></table>}
   {tab==='cards'&&<table><thead><tr><th>卡片</th><th>用户</th><th>商户</th><th>类型</th><th>余额</th><th>状态</th><th>创建日</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.id}><td><b>{row.maskedPan}</b><small>{row.id}</small></td><td>{row.userId}</td><td>{row.merchantId}</td><td>{row.type}</td><td>{money(row.balance,row.currency)}</td><td><Badge value={row.status}/></td><td>{row.createdAt.slice(0,10)}</td></tr>)}</tbody></table>}
   {tab==='wallets'&&<table><thead><tr><th>钱包</th><th>用户</th><th>商户</th><th>币种</th><th>余额</th><th>状态</th><th>创建日</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.id}><td><b>{row.id}</b></td><td>{row.userId}</td><td>{row.merchantId}</td><td>{row.currency}</td><td>{money(row.balance,row.currency)}</td><td><Badge value={row.status}/></td><td>{row.createdAt.slice(0,10)}</td></tr>)}</tbody></table>}
   {tab==='transactions'&&<table><thead><tr><th>交易</th><th>商户</th><th>卡片 / 钱包</th><th>类型</th><th>金额</th><th>Risk</th><th>状态</th><th>时间</th></tr></thead><tbody>{rows.slice(0,300).map((row:any)=><tr key={row.id}><td><b>{row.id}</b></td><td>{row.merchantId}</td><td>{row.cardId}<small>{row.walletId}</small></td><td>{row.type}</td><td>{money(row.amount,row.currency)}</td><td className={row.riskScore>=80?'s06-risk-high':''}>{row.riskScore}</td><td><Badge value={row.status}/></td><td>{row.occurredAt.slice(0,16).replace('T',' ')}</td></tr>)}</tbody></table>}
  </article>
 </div>
}

function Badge({value}:{value:string}){return <span className={`s06-status ${value.toLowerCase()}`}>{value}</span>}
