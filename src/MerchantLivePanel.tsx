import {useEffect,useMemo,useState} from 'react'
import {CheckCircle2,Download,KeyRound,LoaderCircle,QrCode,RefreshCw,Search} from 'lucide-react'
import {downloadCsv} from './sprint06DemoData'
import {merchantApi,type Merchant,type MerchantDetail,type MerchantPayment,type MerchantQr} from './merchantApi'
import {getAdminKey,setAdminKey,walletBusinessApi,type Tenant} from './walletBusinessApi'

type Props={notify:(message:string)=>void}
const stamp=()=>Date.now().toString(36)
const nextAction=(status:string):'clear'|'settle'|'reverse'|'refund'|null=>status==='AUTHORIZED'?'clear':status==='CLEARED'?'settle':status==='SETTLED'?'refund':null

export default function MerchantLivePanel({notify}:Props){
 const[key,setKey]=useState(getAdminKey())
 const[tenants,setTenants]=useState<Tenant[]>([])
 const[tenantId,setTenantId]=useState(sessionStorage.getItem('fastlink_merchant_tenant')||sessionStorage.getItem('fastlink_wallet_tenant')||'')
 const[merchants,setMerchants]=useState<Merchant[]>([])
 const[payments,setPayments]=useState<MerchantPayment[]>([])
 const[selectedMerchant,setSelectedMerchant]=useState('')
 const[detail,setDetail]=useState<MerchantDetail|null>(null)
 const[search,setSearch]=useState('')
 const[amount,setAmount]=useState('1.00')
 const[walletAccountId,setWalletAccountId]=useState('')
 const[qr,setQr]=useState<MerchantQr|null>(null)
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const selected=useMemo(()=>merchants.find(row=>row.id===selectedMerchant),[merchants,selectedMerchant])

 const load=async(id=tenantId,apiKey=key,term=search)=>{
  if(!id||!apiKey)return
  setBusy('load');setError('')
  try{const[m,p]=await Promise.all([merchantApi.list(id,apiKey,term),merchantApi.history(id,apiKey)]);setMerchants(m.data);setPayments(p.data);setSelectedMerchant(current=>m.data.some(row=>row.id===current)?current:(m.data[0]?.id||''))}
  catch(e){setError(e instanceof Error?e.message:'读取 Merchant API 失败')}
  finally{setBusy('')}
 }
 const connect=async()=>{
  if(!key)return
  setBusy('connect');setError('')
  try{setAdminKey(key);const rows=(await walletBusinessApi.tenants(key)).filter(row=>row.environment==='SANDBOX');setTenants(rows);const id=rows.some(row=>row.id===tenantId)?tenantId:(rows[0]?.id||'');if(!id)throw new Error('没有可用的 Sandbox 租户');setTenantId(id);sessionStorage.setItem('fastlink_merchant_tenant',id);await load(id,key,'');notify('Merchant Sandbox API 已连接')}
  catch(e){setError(e instanceof Error?e.message:'连接失败')}
  finally{setBusy('')}
 }
 useEffect(()=>{if(key)void connect()},[])
 const chooseTenant=(id:string)=>{setTenantId(id);sessionStorage.setItem('fastlink_merchant_tenant',id);setQr(null);void load(id,key,'')}
 const inspectMerchant=async(id:string)=>{setSelectedMerchant(id);setQr(null);setDetail(null);if(!tenantId||!key)return;setBusy('detail');setError('');try{setDetail(await merchantApi.detail(tenantId,key,id))}catch(e){setError(e instanceof Error?e.message:'读取 Merchant Detail 失败')}finally{setBusy('')}}
 const createQr=async()=>{if(!selected||!tenantId)return;setBusy('qr');setError('');try{const created=await merchantApi.createQr(tenantId,key,selected.id,amount);setQr(created);notify(`QR 已创建 · ${created.qrCode}`)}catch(e){setError(e instanceof Error?e.message:'创建 QR 失败')}finally{setBusy('')}}
 const payQr=async()=>{if(!qr||!walletAccountId)return;setBusy('pay');setError('');try{const payment=await merchantApi.payQr(tenantId,key,qr.qrCode,walletAccountId,`admin-qr-${stamp()}`);notify(`QR 支付已授权 · ${payment.id}`);await load()}catch(e){setError(e instanceof Error?e.message:'QR 支付失败')}finally{setBusy('')}}
 const advance=async(payment:MerchantPayment)=>{const action=nextAction(payment.status);if(!action)return;setBusy(payment.id);setError('');try{const updated=await merchantApi.action(tenantId,key,payment.id,action,`admin-${action}-${stamp()}`);notify(`${payment.id} → ${updated.status}`);await load()}catch(e){setError(e instanceof Error?e.message:`${action} 失败`)}finally{setBusy('')}}
 const exportData=(kind:'merchants'|'payments')=>{const rows=kind==='merchants'?merchants:payments;downloadCsv(`fastlink-live-${kind}.csv`,rows.map(row=>Object.fromEntries(Object.entries(row).filter(([,value])=>['string','number'].includes(typeof value))) as Record<string,string|number>));notify(`${kind} 实时数据已导出`)}

 return <section className="s11-live panel">
  <header><div><span>SPRINT‑11 · REAL API</span><h3>Merchant Business Closure</h3><p>Merchant → QR / Payment → Wallet → Journal → Ledger → Treasury → Audit</p></div><div className={`s07-adapter ${tenantId?'':'mock_fallback'}`}><i/>{tenantId?'SANDBOX API':'NOT CONNECTED'}</div></header>
  <div className="s11-connect"><KeyRound/><input type="password" value={key} onChange={event=>setKey(event.target.value)} placeholder="Railway ADMIN_API_KEY（只保存在当前浏览器会话）"/><button disabled={!key||!!busy} onClick={()=>void connect()}>{busy==='connect'?'连接中…':'连接'}</button><select value={tenantId} onChange={event=>chooseTenant(event.target.value)}><option value="">选择 Sandbox</option>{tenants.map(row=><option key={row.id} value={row.id}>{row.brandName} · {row.id}</option>)}</select><button disabled={!tenantId||!!busy} onClick={()=>void load()}><RefreshCw/>刷新</button></div>
  {error&&<div className="s11-error">{error}</div>}
  <div className="s11-search"><label><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="搜索 Merchant 名称、External ID 或 MCC"/></label><button disabled={!tenantId||!!busy} onClick={()=>void load(tenantId,key,search)}>搜索</button><button onClick={()=>exportData('merchants')}><Download/>Merchants CSV</button><button onClick={()=>exportData('payments')}><Download/>Payments CSV</button></div>
  <div className="s11-grid">
   <article><h4>Merchant List <em>{merchants.length}</em></h4><div className="s11-list">{merchants.map(row=><button key={row.id} className={row.id===selectedMerchant?'active':''} onClick={()=>void inspectMerchant(row.id)}><b>{row.name}</b><span>{row.mcc} · {row.settlementAssetCode}</span><i>{row.status}</i><small>{row.externalMerchantId}</small></button>)}</div></article>
   <article><h4><QrCode/> QR Payment</h4><div className="s11-qr"><strong>{selected?.name||'请选择 Merchant'}</strong>{detail&&<small>Merchant Detail · {detail.payments.length} recent payments · {detail.qrCodes.length} QR codes</small>}<label>固定金额<input value={amount} onChange={event=>setAmount(event.target.value)} inputMode="decimal"/></label><button disabled={!selected||!!busy} onClick={()=>void createQr()}>{busy==='qr'?<LoaderCircle className="spin"/>:<QrCode/>}创建 15 分钟 QR</button>{qr&&<><code>{qr.qrCode}</code><small>{qr.amount} {qr.assetCode} · {new Date(qr.expiresAt).toLocaleString()}</small><label>付款 Wallet Account ID<input value={walletAccountId} onChange={event=>setWalletAccountId(event.target.value)}/></label><button disabled={!walletAccountId||!!busy} onClick={()=>void payQr()}>{busy==='pay'?<LoaderCircle className="spin"/>:<CheckCircle2/>}执行 QR Payment</button></>}</div></article>
  </div>
  <article className="s11-payments"><h4>Payment History <em>{payments.length}</em></h4><table><thead><tr><th>Payment</th><th>Merchant</th><th>Wallet / Card</th><th>Amount</th><th>Journal</th><th>Status</th><th>Action</th></tr></thead><tbody>{payments.map(row=>{const action=nextAction(row.status);return <tr key={row.id}><td><b>{row.id}</b><small>{new Date(row.createdAt).toLocaleString()}</small></td><td>{row.merchant?.name||row.merchantId}</td><td>{row.walletAccountId}<small>{row.cardId||'Wallet only'}</small></td><td>{row.amount} {row.assetCode}</td><td>{row.journalIds.length} entries</td><td><span className={`s06-status ${row.status.toLowerCase()}`}>{row.status}</span></td><td><button disabled={!action||!!busy} onClick={()=>void advance(row)}>{busy===row.id?'处理中…':action?`${action.toUpperCase()} →`:'完成'}</button></td></tr>})}</tbody></table></article>
 </section>
}
