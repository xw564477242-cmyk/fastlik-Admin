import {useMemo,useState} from 'react'
import {CreditCard,Eye,EyeOff,KeyRound,LoaderCircle,LockKeyhole,Plus,RefreshCw,Search,Snowflake,Sun,Truck} from 'lucide-react'
import {createSprint06DemoData,type DemoCard,downloadCsv} from './sprint06DemoData'
import {getAdminKey,setAdminKey,walletBusinessApi,type Tenant} from './walletBusinessApi'

type Props={notify:(message:string)=>void}
const money=(value:number,currency:string)=>`${currency} ${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function CardCenter({notify}:Props){
 const demo=useMemo(()=>createSprint06DemoData(),[])
 const[cards,setCards]=useState<DemoCard[]>(demo.cards)
 const[selectedId,setSelectedId]=useState(demo.cards[0].id)
 const[query,setQuery]=useState('')
 const[status,setStatus]=useState('ALL')
 const[cardType,setCardType]=useState<'VIRTUAL'|'PHYSICAL'>('VIRTUAL')
 const[holder,setHolder]=useState('FastLink Sandbox User')
 const[currency,setCurrency]=useState('USD')
 const[pin,setPin]=useState('')
 const[cvv,setCvv]=useState('')
 const[key,setKey]=useState(getAdminKey())
 const[tenants,setTenants]=useState<Tenant[]>([])
 const[tenantId,setTenantId]=useState(sessionStorage.getItem('fastlink_card_tenant')||'')
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const selected=cards.find(card=>card.id===selectedId)||cards[0]
 const rows=useMemo(()=>cards.filter(card=>(status==='ALL'||card.status===status)&&`${card.id} ${card.holder} ${card.maskedPan} ${card.type}`.toLowerCase().includes(query.toLowerCase())),[cards,query,status])
 const transactions=useMemo(()=>demo.transactions.filter(row=>row.cardId===selected?.id).slice(0,25),[demo.transactions,selected?.id])

 const connect=async()=>{if(!key)return;setBusy('connect');setError('');try{setAdminKey(key);const next=await walletBusinessApi.tenants(key);const sandbox=next.filter(row=>row.environment==='SANDBOX');setTenants(sandbox);const id=sandbox.some(row=>row.id===tenantId)?tenantId:sandbox[0]?.id||'';setTenantId(id);if(id)sessionStorage.setItem('fastlink_card_tenant',id);notify('Card Center 已连接 Railway Sandbox')}catch(e){setError(e instanceof Error?e.message:'连接失败')}finally{setBusy('')}}
 const createCard=async()=>{setBusy('create');setError('');try{
  if(key&&tenantId){
   const stamp=Date.now().toString(36);const customer=await walletBusinessApi.createCardCustomer(tenantId,key,`card-center-${stamp}`);const created=await walletBusinessApi.createProcessorCard(tenantId,key,customer.id,`card-center:${stamp}`,cardType,currency)
   const next:DemoCard={id:created.id,userId:customer.id,holder,type:cardType,status:(created.status as DemoCard['status'])||'ACTIVE',provider:'THREDD_MOCK',maskedPan:created.maskedPan||`•••• •••• •••• ${created.last4||'0000'}`,expiry:`${String(created.expiryMonth||1).padStart(2,'0')}/${String(created.expiryYear||29).slice(-2)}`,currency:created.currency||currency,balance:Number(created.balance?.availableBalanceMinor||0)/100,createdAt:new Date().toISOString()}
   setCards(value=>[next,...value]);setSelectedId(next.id);notify(`${cardType==='PHYSICAL'?'实体卡':'虚拟卡'}已通过 CardService 创建`)
  }else{
   const nextNumber=cards.length+1;const next:DemoCard={id:`CRD-DEMO-${nextNumber}`,userId:`USR-DEMO-${nextNumber}`,holder,type:cardType,status:'ACTIVE',provider:'THREDD_MOCK',maskedPan:`5239 •••• •••• ${String(7200+nextNumber).slice(-4)}`,expiry:'07/29',currency,balance:0,createdAt:new Date().toISOString()};setCards(value=>[next,...value]);setSelectedId(next.id);notify(`Demo ${cardType==='PHYSICAL'?'实体卡':'虚拟卡'}创建成功`)
  }
 }catch(e){setError(e instanceof Error?e.message:'创建卡片失败')}finally{setBusy('')}}
 const changeStatus=async(action:'freeze'|'unfreeze')=>{if(!selected)return;setBusy(action);setError('');try{let nextStatus:DemoCard['status']=action==='freeze'?'FROZEN':'ACTIVE';if(key&&tenantId&&!selected.id.startsWith('CRD-')){const stamp=Date.now().toString(36);const next=action==='freeze'?await walletBusinessApi.freezeProcessorCard(tenantId,key,selected.id,`card-center:${stamp}:freeze`):await walletBusinessApi.unfreezeProcessorCard(tenantId,key,selected.id,`card-center:${stamp}:unfreeze`);nextStatus=next.status as DemoCard['status']}setCards(value=>value.map(card=>card.id===selected.id?{...card,status:nextStatus}:card));notify(action==='freeze'?'卡片已冻结':'卡片已解冻')}catch(e){setError(e instanceof Error?e.message:'卡片操作失败')}finally{setBusy('')}}
 const refreshBalance=async()=>{if(!selected)return;setBusy('balance');setError('');try{if(key&&tenantId&&!selected.id.startsWith('CRD-')){const balance=await walletBusinessApi.processorCardBalance(tenantId,key,selected.id);setCards(value=>value.map(card=>card.id===selected.id?{...card,balance:Number(balance.availableBalanceMinor)/100,currency:balance.currency}:card))}notify('卡片余额已刷新')}catch(e){setError(e instanceof Error?e.message:'余额查询失败')}finally{setBusy('')}}
 const updatePin=async()=>{if(!/^[0-9]{4}$/.test(pin)){setError('PIN 必须为 4 位数字');return}setBusy('pin');setError('');try{if(key&&tenantId&&!selected.id.startsWith('CRD-'))await walletBusinessApi.setSandboxPin(tenantId,key,selected.id,pin);setPin('');notify('PIN 已通过安全操作更新（不会被保存或显示）')}catch(e){setError(e instanceof Error?`${e.message} · 当前卡可能不支持 Sandbox PIN`:'PIN 更新失败')}finally{setBusy('')}}
 const revealCvv=async()=>{if(!selected)return;setBusy('cvv');setError('');try{let value=String(100+(Number(selected.id.replace(/\D/g,'').slice(-3))||53)).slice(-3);if(key&&tenantId&&!selected.id.startsWith('CRD-')){const result=await walletBusinessApi.revealSandboxCvv(tenantId,key,selected.id);value=result.cvv||value}setCvv(value);window.setTimeout(()=>setCvv(''),30000);notify('CVV 已临时显示，将在 30 秒后隐藏')}catch(e){setError(e instanceof Error?`${e.message} · 当前卡可能不支持 Sandbox CVV`:'CVV 查询失败')}finally{setBusy('')}}

 return <div className="s06-page">
  <div className="s06-page-head"><div><span>SPRINT‑06 · CARD CENTER</span><h2>卡片生命周期与持卡人服务</h2><p>CardService → CardProcessorProvider → THREDD_MOCK；连接 Sandbox 后自动切换为真实 API。</p></div><div className="s06-mode"><i/> {key&&tenantId?'RAILWAY SANDBOX':'DEMO MODE'}</div></div>
  <section className="s06-connect"><KeyRound/><input type="password" value={key} onChange={event=>setKey(event.target.value)} placeholder="ADMIN_API_KEY（只保存于当前浏览器会话）"/><button onClick={()=>void connect()} disabled={!key||!!busy}>{busy==='connect'?<LoaderCircle className="spin"/>:'连接'}</button><select value={tenantId} onChange={event=>{setTenantId(event.target.value);sessionStorage.setItem('fastlink_card_tenant',event.target.value)}}><option value="">Demo / 选择 Sandbox 租户</option>{tenants.map(tenant=><option key={tenant.id} value={tenant.id}>{tenant.brandName}</option>)}</select></section>
  {error&&<div className="s06-error">{error}</div>}
  <section className="s06-create panel"><div><h3><Plus/>创建卡片</h3><p>虚拟卡与实体卡共用统一 CardService；实体卡自动附加 Sandbox 配送地址。</p></div><input value={holder} onChange={event=>setHolder(event.target.value)} placeholder="持卡人姓名"/><select value={cardType} onChange={event=>setCardType(event.target.value as 'VIRTUAL'|'PHYSICAL')}><option value="VIRTUAL">VIRTUAL · 虚拟卡</option><option value="PHYSICAL">PHYSICAL · 实体卡</option></select><select value={currency} onChange={event=>setCurrency(event.target.value)}>{['USD','EUR','GBP','MYR','SGD'].map(value=><option key={value}>{value}</option>)}</select><button className="primary-btn" onClick={()=>void createCard()} disabled={busy==='create'}>{cardType==='PHYSICAL'?<Truck/>:<CreditCard/>}{busy==='create'?'创建中…':'创建卡片'}</button></section>
  <section className="s06-card-layout">
   <article className="panel s06-card-list"><div className="s06-tools"><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索卡号、用户、类型"/></label><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">全部状态</option><option>ACTIVE</option><option>FROZEN</option><option>PENDING</option></select><button onClick={()=>downloadCsv('fastlink-cards.csv',rows.map(card=>({id:card.id,holder:card.holder,type:card.type,status:card.status,currency:card.currency,balance:card.balance})))}>导出 CSV</button></div><div className="s06-scroll-table"><table><thead><tr><th>卡片</th><th>类型</th><th>余额</th><th>状态</th></tr></thead><tbody>{rows.map(card=><tr key={card.id} className={card.id===selected?.id?'selected':''} onClick={()=>setSelectedId(card.id)}><td><b>{card.maskedPan}</b><small>{card.holder} · {card.id}</small></td><td>{card.type}</td><td>{money(card.balance,card.currency)}</td><td><span className={`s06-status ${card.status.toLowerCase()}`}>{card.status}</span></td></tr>)}</tbody></table></div></article>
   {selected&&<article className="panel s06-card-detail"><div className={`s06-bank-card ${selected.status==='FROZEN'?'frozen':''}`}><span>FASTLINK · {selected.provider}</span><strong>{selected.maskedPan}</strong><div><b>{selected.holder}</b><b>{selected.expiry}</b></div></div><div className="s06-detail-grid"><div><span>Card ID</span><b>{selected.id}</b></div><div><span>Card Type</span><b>{selected.type}</b></div><div><span>Available Balance</span><b>{money(selected.balance,selected.currency)}</b></div><div><span>Status</span><b>{selected.status}</b></div></div><div className="s06-card-actions"><button onClick={()=>void changeStatus(selected.status==='FROZEN'?'unfreeze':'freeze')} disabled={!!busy}><Snowflake/>{selected.status==='FROZEN'?'解冻':'冻结'}</button><button onClick={()=>void refreshBalance()} disabled={!!busy}><RefreshCw/>查询余额</button></div><div className="s06-sensitive"><label><LockKeyhole/>PIN<input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))} placeholder="4 位数字"/><button onClick={()=>void updatePin()} disabled={busy==='pin'}>更新</button></label><label>{cvv?<EyeOff/>:<Eye/>}CVV<strong>{cvv||'•••'}</strong><button onClick={()=>void revealCvv()} disabled={busy==='cvv'}>{cvv?'已显示':'查看 30 秒'}</button></label></div></article>}
  </section>
  <article className="panel s06-transactions"><div className="panel-title"><div><h3>Card Transactions</h3><p>当前卡片最近授权、ATM、退款和资金入卡记录</p></div><button onClick={()=>downloadCsv(`fastlink-${selected?.id||'card'}-transactions.csv`,transactions.map(row=>({id:row.id,type:row.type,merchant:row.merchant,amount:row.amount,currency:row.currency,status:row.status,createdAt:row.createdAt})))}>导出当前卡交易</button></div><table><thead><tr><th>交易</th><th>商户</th><th>类型</th><th>金额</th><th>风险</th><th>状态</th><th>时间</th></tr></thead><tbody>{transactions.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.merchant}</td><td>{row.type}</td><td>{money(row.amount,row.currency)}</td><td>{row.riskScore}</td><td><span className={`s06-status ${row.status.toLowerCase()}`}>{row.status}</span></td><td>{row.createdAt.slice(0,10)}</td></tr>)}</tbody></table></article>
 </div>
}
