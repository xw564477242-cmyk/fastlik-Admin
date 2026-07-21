import {useMemo,useState} from 'react'
import {Clock3,CreditCard,Download,History,Search,ShieldCheck} from 'lucide-react'
import {downloadCsv} from './sprint06DemoData'
import {createSprint07DemoData} from './sprint07DemoData'

type Props={notify:(message:string)=>void}

export default function CardHistory({notify}:Props){
 const data=useMemo(()=>createSprint07DemoData(),[])
 const[query,setQuery]=useState('')
 const[event,setEvent]=useState('ALL')
 const[actor,setActor]=useState('ALL')
 const rows=useMemo(()=>data.cardHistory.filter(row=>(event==='ALL'||row.event===event)&&(actor==='ALL'||row.actor===actor)&&`${row.id} ${row.cardId} ${row.event} ${row.actor} ${row.fromStatus} ${row.toStatus}`.toLowerCase().includes(query.toLowerCase())),[actor,data.cardHistory,event,query])
 const exportRows=()=>{downloadCsv('fastlink-card-history.csv',rows.map(row=>({...row})));notify('Card History 已导出')}
 return <div className="s07-page">
  <header className="s07-head history"><div><span>SPRINT‑07 · CARD HISTORY</span><h2>卡片生命周期审计历史</h2><p>从侧栏直接访问卡片创建、激活、冻结、解冻、余额查询、PIN 与 CVV 操作轨迹。</p></div><div className="s07-adapter mock"><i/>AUDIT MOCK</div></header>
  <section className="s07-metrics"><article><History/><span>历史事件</span><strong>{data.cardHistory.length.toLocaleString()}</strong><small>覆盖 500 张测试卡</small></article><article><CreditCard/><span>涉及卡片</span><strong>{new Set(data.cardHistory.map(row=>row.cardId)).size}</strong><small>虚拟卡与实体卡</small></article><article><ShieldCheck/><span>敏感操作</span><strong>{data.cardHistory.filter(row=>row.event==='PIN_UPDATED'||row.event==='CVV_REVEALED').length}</strong><small>仅记录事件，不保存秘密数据</small></article><article><Clock3/><span>筛选结果</span><strong>{rows.length.toLocaleString()}</strong><small>支持 CSV 审计导出</small></article></section>
  <article className="panel s07-testing-table"><div className="s07-tools"><label><Search/><input value={query} onChange={value=>setQuery(value.target.value)} placeholder="搜索 Card ID、事件、Actor"/></label><select value={event} onChange={value=>setEvent(value.target.value)}><option value="ALL">全部事件</option>{['CREATED','ACTIVATED','FROZEN','UNFROZEN','BALANCE_CHECK','PIN_UPDATED','CVV_REVEALED'].map(value=><option key={value}>{value}</option>)}</select><select value={actor} onChange={value=>setActor(value.target.value)}><option value="ALL">全部 Actor</option><option>CARDHOLDER</option><option>SANDBOX_ADMIN</option></select><span>{rows.length.toLocaleString()} 条结果</span><button onClick={exportRows}><Download/>导出 CSV</button></div><table><thead><tr><th>Event ID</th><th>Card ID</th><th>事件</th><th>状态变化</th><th>Actor</th><th>发生时间</th></tr></thead><tbody>{rows.slice(0,500).map(row=><tr key={row.id}><td><b>{row.id}</b></td><td>{row.cardId}</td><td><span className={`s07-event ${row.event.toLowerCase()}`}>{row.event}</span></td><td>{row.fromStatus} → {row.toStatus}</td><td>{row.actor}</td><td>{row.occurredAt.slice(0,16).replace('T',' ')}</td></tr>)}</tbody></table></article>
 </div>
}
