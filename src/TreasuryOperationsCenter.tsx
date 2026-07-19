import {useEffect,useMemo,useState} from 'react'
import {Activity,ArrowRightLeft,Banknote,CheckCircle2,CircleDollarSign,Landmark,RefreshCw,ShieldCheck,TrendingUp,WalletCards,X} from 'lucide-react'
import {getApiBase,setApiBase,treasuryApi,type TreasuryDashboard} from './treasuryApi'

type Props={onClose:()=>void;notify:(message:string)=>void}
type Currency='USD'|'EUR'|'GBP'|'SGD'|'MYR'
const money=(value:number,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(value)

export default function TreasuryOperationsCenter({onClose,notify}:Props){
 const[data,setData]=useState<TreasuryDashboard|null>(null)
 const[loading,setLoading]=useState(true)
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const[apiUrl,setUrl]=useState(getApiBase())
 const[fxFrom,setFxFrom]=useState<Currency>('USD')
 const[fxTo,setFxTo]=useState<Currency>('MYR')
 const[fxAmount,setFxAmount]=useState(100000)
 const[targetRatio,setTargetRatio]=useState(130)
 const load=async()=>{setLoading(true);setError('');try{const result=await treasuryApi.dashboard();setData(result);setTargetRatio(result.liquidity.targetRatio)}catch(e){setError(e instanceof Error?e.message:'无法连接 FastLink API')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 const execute=async(name:string,action:()=>Promise<unknown>,message:string)=>{setBusy(name);try{await action();await load();notify(message)}catch(e){const m=e instanceof Error?e.message:'操作失败';setError(m);notify(m)}finally{setBusy('')}}
 const pending=useMemo(()=>data?.settlements.filter(x=>x.status==='PENDING').reduce((s,x)=>s+x.amount,0)??0,[data])
 const saveApi=()=>{setApiBase(apiUrl);void load();notify('API 地址已保存，正在重新连接')}
 const a=data?.accounts??{usdt:0,fiat:0,sponsorReserve:0,requiredReserve:0}
 const l=data?.liquidity??{ratio:0,minRatio:115,targetRatio:130,autoTopup:true,totalLiquidity:0}
 return <div className="treasury-overlay"><div className="treasury-window">
  <header className="treasury-head"><div><span>FASTLINK TREASURY CONTROL PLANE</span><h2>Treasury Operations Center</h2><p>真实 API + Supabase PostgreSQL · 资金、准备金、清算与换汇管理</p></div><button onClick={onClose}><X/></button></header>
  <div className="treasury-body">
   <section className="api-connection"><div><i className={error?'offline':'online'}/><b>{error?'Backend Offline':'Backend Connected'}</b><span>{loading?'正在读取数据库…':data?`最后同步 ${new Date(data.generatedAt).toLocaleTimeString('zh-CN')}`:'尚未同步'}</span></div><input value={apiUrl} onChange={e=>setUrl(e.target.value)} aria-label="FastLink API URL"/><button onClick={saveApi}>连接 API</button><button onClick={()=>void load()}><RefreshCw size={15}/>刷新</button></section>
   {error&&<div className="treasury-error">{error}。请确认 Railway 已部署成功，并在 CORS_ORIGIN 中包含 GitHub Pages 地址。</div>}
   <section className="toc-metrics">
    <article><WalletCards/><span>USDT 总持仓</span><strong>{money(a.usdt)}</strong><small>数据库实时余额</small></article>
    <article><Banknote/><span>法币准备金</span><strong>{money(a.fiat)}</strong><small>可调拨流动资金</small></article>
    <article><Landmark/><span>Sponsor Bank Reserve</span><strong>{money(a.sponsorReserve)}</strong><small>最低需求 {money(a.requiredReserve)}</small></article>
    <article className={l.ratio<l.minRatio?'danger':'healthy'}><ShieldCheck/><span>Liquidity Ratio</span><strong>{l.ratio}%</strong><small>最低阈值 {l.minRatio}%</small></article>
   </section>
   <section className="toc-grid">
    <article className="toc-panel liquidity-panel"><div className="toc-title"><div><h3>流动性与自动补充准备金</h3><p>由后端事务锁定账户并写入资金操作日志。</p></div><span className="db-badge">POSTGRESQL</span></div>
     <div className="ratio-ring" style={{'--ratio':`${Math.min(l.ratio,160)/160*360}deg`} as React.CSSProperties}><div><b>{l.ratio}%</b><span>当前流动性</span></div></div>
     <div className="thresholds"><label>最低阈值<input type="number" value={l.minRatio} readOnly/><em>%</em></label><label>补充目标<input type="number" value={targetRatio} onChange={e=>setTargetRatio(Number(e.target.value))}/><em>%</em></label></div>
     <div className="reserve-track"><div><span>当前 Sponsor Reserve</span><b>{money(a.sponsorReserve)}</b></div><div><span>结算最低需求</span><b>{money(a.requiredReserve)}</b></div><div><span>平台可用流动性</span><b>{money(l.totalLiquidity)}</b></div></div>
     <button className="toc-primary" disabled={!!busy||loading} onClick={()=>void execute('topup',()=>treasuryApi.rebalance(targetRatio),'准备金补充已写入数据库')}><RefreshCw/>{busy==='topup'?'处理中…':'立即执行准备金补充'}</button>
    </article>
    <article className="toc-panel"><div className="toc-title"><div><h3>FX Conversion</h3><p>通过后端 Provider Adapter 创建并保存换汇订单。</p></div><ArrowRightLeft/></div>
     <div className="fx-form"><label>卖出币种<select value={fxFrom} onChange={e=>setFxFrom(e.target.value as Currency)}>{['USD','EUR','GBP','SGD','MYR'].map(x=><option key={x}>{x}</option>)}</select></label><label>买入币种<select value={fxTo} onChange={e=>setFxTo(e.target.value as Currency)}>{['MYR','SGD','USD','EUR','GBP'].map(x=><option key={x}>{x}</option>)}</select></label><label className="fx-amount">换汇金额<input type="number" value={fxAmount} onChange={e=>setFxAmount(Number(e.target.value))}/></label></div>
     <div className="fx-quote"><span>Sandbox Provider</span><strong>FOMO_PAY_SANDBOX</strong><small>订单会保存到 treasury_fx_orders</small></div>
     <button className="toc-primary" disabled={!!busy} onClick={()=>void execute('fx',()=>treasuryApi.fx(fxFrom,fxTo,fxAmount),'换汇订单已完成并保存')}><ArrowRightLeft/>{busy==='fx'?'处理中…':'执行换汇'}</button>
    </article>
   </section>
   <section className="toc-grid lower">
    <article className="toc-panel"><div className="toc-title"><div><h3>Daily Settlement</h3><p>读取并处理 treasury_settlements 待清算批次。</p></div><CircleDollarSign/></div>
     <div className="settlement-summary"><div><span>待清算总额</span><b>{money(pending)}</b></div><div><span>待处理批次</span><b>{data?.settlements.filter(x=>x.status==='PENDING').length??0}</b></div><div><span>执行模式</span><b>数据库事务</b></div></div>
     <table><thead><tr><th>批次</th><th>主体</th><th>金额</th><th>状态</th></tr></thead><tbody>{data?.settlements.map(x=><tr key={x.id}><td><b>{x.id}</b><small>{new Date(x.scheduledAt).toLocaleString('zh-CN')}</small></td><td>{x.tenant}</td><td>{money(x.amount,x.currency)}</td><td><span className={`toc-status ${x.status==='COMPLETED'?'done':'pending'}`}>{x.status==='COMPLETED'?'已完成':'待处理'}</span></td></tr>)}</tbody></table>
     <button className="toc-primary" disabled={!pending||!!busy} onClick={()=>void execute('settle',()=>treasuryApi.settle(),'日终清算已完成并写入数据库')}><CheckCircle2/>{busy==='settle'?'清算中…':'执行日终清算'}</button>
    </article>
    <article className="toc-panel"><div className="toc-title"><div><h3>Treasury Dashboard</h3><p>来自 treasury_operation_logs 的真实操作记录。</p></div><Activity/></div><div className="toc-logs">{data?.logs.map(x=><div key={x.id}><span>{new Date(x.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span><i className={x.status==='SUCCESS'?'ok':'wait'}/><section><b>{x.event}</b><p>{x.detail}</p></section><em>{x.status==='SUCCESS'?'成功':x.status}</em></div>)}</div></article>
   </section>
   <section className="toc-actions"><button disabled={!!busy} onClick={()=>void execute('usdt',()=>treasuryApi.simulateUsdt(),'50,000 USDT 已写入 Treasury 数据库')}><TrendingUp/>Sandbox USDT 入池</button><button disabled={!!busy} onClick={()=>void execute('demand',()=>treasuryApi.simulateReserveDemand(),'准备金需求预测已更新')}><Landmark/>增加准备金需求</button><button onClick={()=>window.print()}><CircleDollarSign/>生成资金日报</button></section>
  </div>
 </div></div>
}
