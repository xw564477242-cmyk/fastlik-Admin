import {useMemo,useState} from 'react'
import {Activity,ArrowRightLeft,Banknote,CheckCircle2,CircleDollarSign,Landmark,RefreshCw,ShieldCheck,TrendingUp,WalletCards,X} from 'lucide-react'

type Props={onClose:()=>void;notify:(message:string)=>void}
type Currency='USD'|'EUR'|'GBP'|'SGD'|'MYR'
type Settlement={id:string;tenant:string;amount:number;currency:Currency;status:'待处理'|'已完成';time:string}
type Log={time:string;event:string;detail:string;status:'成功'|'待审批'}

const money=(value:number,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(value)

export default function TreasuryOperationsCenter({onClose,notify}:Props){
 const[usdt,setUsdt]=useState(18420000)
 const[fiat,setFiat]=useState(3860000)
 const[sponsorReserve,setSponsorReserve]=useState(1240000)
 const[requiredReserve,setRequiredReserve]=useState(1080000)
 const[autoTopup,setAutoTopup]=useState(true)
 const[minRatio,setMinRatio]=useState(115)
 const[targetRatio,setTargetRatio]=useState(130)
 const[fxFrom,setFxFrom]=useState<Currency>('USD')
 const[fxTo,setFxTo]=useState<Currency>('MYR')
 const[fxAmount,setFxAmount]=useState(100000)
 const[settlements,setSettlements]=useState<Settlement[]>([
  {id:'STL-260719-001',tenant:'NovaPay Asia',amount:228600,currency:'USD',status:'待处理',time:'18:00'},
  {id:'STL-260719-002',tenant:'Orbit Card Labs',amount:146200,currency:'USD',status:'待处理',time:'18:15'},
  {id:'STL-260718-014',tenant:'FastLink Platform',amount:618400,currency:'USD',status:'已完成',time:'昨日 23:40'}
 ])
 const[logs,setLogs]=useState<Log[]>([
  {time:'20:18',event:'流动性监测',detail:'Sponsor Bank Reserve 比率正常',status:'成功'},
  {time:'19:45',event:'自动补充准备金',detail:'补充 USD 80,000 至 Sponsor Bank',status:'成功'},
  {time:'18:30',event:'FX Conversion',detail:'USD 150,000 → MYR 661,500',status:'成功'},
  {time:'17:20',event:'大额资金调拨',detail:'USDT Treasury → Fiat Treasury',status:'待审批'}
 ])
 const pending=useMemo(()=>settlements.filter(x=>x.status==='待处理').reduce((s,x)=>s+x.amount,0),[settlements])
 const ratio=requiredReserve?Math.round(sponsorReserve/requiredReserve*100):0
 const totalLiquidity=fiat+sponsorReserve
 const addLog=(event:string,detail:string,status:Log['status']='成功')=>setLogs(v=>[{time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),event,detail,status},...v].slice(0,8))
 const runTopup=()=>{
  const target=Math.ceil(requiredReserve*targetRatio/100)
  const amount=Math.max(0,target-sponsorReserve)
  if(!amount){notify('Sponsor Bank Reserve 已达到目标比例');return}
  if(amount>fiat){notify('法币准备金不足，无法完成自动补充');return}
  setFiat(v=>v-amount);setSponsorReserve(v=>v+amount);addLog('自动补充准备金',`从 Fiat Treasury 调拨 ${money(amount)} 至 Sponsor Bank`);notify('自动补充准备金已执行')
 }
 const runSettlement=()=>{
  if(!pending){notify('当前没有待处理清算');return}
  setSettlements(v=>v.map(x=>x.status==='待处理'?{...x,status:'已完成'}:x));setFiat(v=>v-pending);addLog('Daily Settlement',`完成日终清算 ${money(pending)}`);notify('日终清算批次已完成')
 }
 const runFx=()=>{
  if(fxAmount<=0){notify('请输入有效换汇金额');return}
  const rates:Record<string,number>={'USD-MYR':4.41,'USD-SGD':1.35,'USD-EUR':.92,'USD-GBP':.78,'MYR-USD':.227,'SGD-USD':.741,'EUR-USD':1.087,'GBP-USD':1.282}
  const rate=rates[`${fxFrom}-${fxTo}`]??1
  const result=fxAmount*rate
  addLog('FX Conversion',`${fxFrom} ${fxAmount.toLocaleString()} → ${fxTo} ${result.toLocaleString(undefined,{maximumFractionDigits:2})}`);notify('模拟换汇订单执行成功')
 }
 return <div className="treasury-overlay">
  <div className="treasury-window">
   <header className="treasury-head"><div><span>FASTLINK TREASURY CONTROL PLANE</span><h2>Treasury Operations Center</h2><p>资金运营中心 · 多租户资金池、准备金、流动性、清算与换汇管理</p></div><button onClick={onClose}><X/></button></header>
   <div className="treasury-body">
    <section className="toc-metrics">
     <article><WalletCards/><span>USDT 总持仓</span><strong>{money(usdt)}</strong><small>公司 Treasury 总资产</small></article>
     <article><Banknote/><span>法币准备金</span><strong>{money(fiat)}</strong><small>可调拨流动资金</small></article>
     <article><Landmark/><span>Sponsor Bank Reserve</span><strong>{money(sponsorReserve)}</strong><small>最低需求 {money(requiredReserve)}</small></article>
     <article className={ratio<minRatio?'danger':'healthy'}><ShieldCheck/><span>Liquidity Ratio</span><strong>{ratio}%</strong><small>最低阈值 {minRatio}%</small></article>
    </section>

    <section className="toc-grid">
     <article className="toc-panel liquidity-panel"><div className="toc-title"><div><h3>流动性与自动补充准备金</h3><p>持续监测 Sponsor Bank 资金需求，触发自动或人工补充。</p></div><label className="toc-switch"><input type="checkbox" checked={autoTopup} onChange={e=>setAutoTopup(e.target.checked)}/><i/><span>{autoTopup?'自动模式':'人工模式'}</span></label></div>
      <div className="ratio-ring" style={{'--ratio':`${Math.min(ratio,160)/160*360}deg`} as React.CSSProperties}><div><b>{ratio}%</b><span>当前流动性</span></div></div>
      <div className="thresholds"><label>最低阈值<input type="number" value={minRatio} onChange={e=>setMinRatio(Number(e.target.value))}/><em>%</em></label><label>补充目标<input type="number" value={targetRatio} onChange={e=>setTargetRatio(Number(e.target.value))}/><em>%</em></label></div>
      <div className="reserve-track"><div><span>当前 Sponsor Reserve</span><b>{money(sponsorReserve)}</b></div><div><span>结算最低需求</span><b>{money(requiredReserve)}</b></div><div><span>平台可用流动性</span><b>{money(totalLiquidity)}</b></div></div>
      <button className="toc-primary" onClick={runTopup}><RefreshCw/>立即执行准备金补充</button>
     </article>

     <article className="toc-panel"><div className="toc-title"><div><h3>FX Conversion</h3><p>模拟 FOMO Pay / 流动性供应商换汇编排。</p></div><ArrowRightLeft/></div>
      <div className="fx-form"><label>卖出币种<select value={fxFrom} onChange={e=>setFxFrom(e.target.value as Currency)}>{['USD','EUR','GBP','SGD','MYR'].map(x=><option key={x}>{x}</option>)}</select></label><label>买入币种<select value={fxTo} onChange={e=>setFxTo(e.target.value as Currency)}>{['MYR','SGD','USD','EUR','GBP'].map(x=><option key={x}>{x}</option>)}</select></label><label className="fx-amount">换汇金额<input type="number" value={fxAmount} onChange={e=>setFxAmount(Number(e.target.value))}/></label></div>
      <div className="fx-quote"><span>模拟最优报价</span><strong>1 {fxFrom} ≈ {fxFrom===fxTo?'1.0000':fxFrom==='USD'&&fxTo==='MYR'?'4.4100':'市场报价'} {fxTo}</strong><small>Provider: FOMO Pay Adapter · 报价有效 30 秒</small></div>
      <button className="toc-primary" onClick={runFx}><ArrowRightLeft/>执行模拟换汇</button>
     </article>
    </section>

    <section className="toc-grid lower">
     <article className="toc-panel"><div className="toc-title"><div><h3>Daily Settlement</h3><p>当日卡消费、ATM、商户支付与合作方净额清算。</p></div><CircleDollarSign/></div>
      <div className="settlement-summary"><div><span>待清算总额</span><b>{money(pending)}</b></div><div><span>待处理批次</span><b>{settlements.filter(x=>x.status==='待处理').length}</b></div><div><span>预计执行时间</span><b>23:30 UTC+8</b></div></div>
      <table><thead><tr><th>批次</th><th>主体</th><th>金额</th><th>状态</th></tr></thead><tbody>{settlements.map(x=><tr key={x.id}><td><b>{x.id}</b><small>{x.time}</small></td><td>{x.tenant}</td><td>{money(x.amount,x.currency)}</td><td><span className={`toc-status ${x.status==='已完成'?'done':'pending'}`}>{x.status}</span></td></tr>)}</tbody></table>
      <button className="toc-primary" disabled={!pending} onClick={runSettlement}><CheckCircle2/>执行日终清算</button>
     </article>
     <article className="toc-panel"><div className="toc-title"><div><h3>Treasury Dashboard</h3><p>资金运营事件、调拨和审批审计记录。</p></div><Activity/></div>
      <div className="toc-logs">{logs.map((x,i)=><div key={`${x.time}-${i}`}><span>{x.time}</span><i className={x.status==='成功'?'ok':'wait'}/><section><b>{x.event}</b><p>{x.detail}</p></section><em>{x.status}</em></div>)}</div>
     </article>
    </section>

    <section className="toc-actions"><button onClick={()=>{setUsdt(v=>v+50000);addLog('USDT Treasury','模拟增加 50,000 USDT');notify('已模拟增加 50,000 USDT')}}><TrendingUp/>模拟 USDT 入池</button><button onClick={()=>{setRequiredReserve(v=>v+50000);addLog('Reserve Forecast','预计清算需求增加 50,000 USD');notify('准备金需求预测已更新')}}><Landmark/>模拟准备金需求</button><button onClick={()=>notify('Treasury Dashboard 报表已生成')}><CircleDollarSign/>生成资金日报</button></section>
   </div>
  </div>
 </div>
}
