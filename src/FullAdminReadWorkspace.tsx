import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, DEFAULT_API, productionApi, type AdminReadQuery, type AdminSession } from './productionApi'

type Row = Record<string, unknown>
type ReadSurface = 'merchants' | 'payments' | 'clients' | 'events' | 'evidence' | 'users'
type ReadPage = { data: Row[]; total: number; limit: number; offset: number }
const surfaces: Record<ReadSurface, {title:string; columns: readonly string[]}> = {
  users:{title:'用户目录',columns:['userId','tenantId','environment','kycStatus','createdAt']},
  merchants:{title:'商户目录',columns:['id','externalMerchantId','name','mcc','settlementAssetCode','status','createdAt']},
  payments:{title:'商户支付历史',columns:['id','merchantId','walletAccountId','cardId','status','assetCode','amount','settlementBatchId','createdAt']},
  clients:{title:'API 客户端',columns:['id','clientId','name','environment','scopes','isActive','createdAt']},
  events:{title:'域事件与 Webhook 处理记录',columns:['id','eventType','status','attempts','traceId','processedAt','createdAt']},
  evidence:{title:'验收证据目录',columns:['id','category','operation','traceId','httpStatus','result','capturedAt','contentHash']},
}
const record = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
export function parseAdminUserRecord(value:unknown,tenantId:string,environment:string,userId?:string):Row {
  if(!record(value)||Object.keys(value).sort().join(',')!=='createdAt,environment,kycStatus,tenantId,userId'||value.tenantId!==tenantId||value.environment!==environment||typeof value.userId!=='string'||!/^[A-Za-z0-9_-]{2,128}$/.test(value.userId)||(userId!==undefined&&value.userId!==userId)||!['PENDING','APPROVED','REJECTED'].includes(String(value.kycStatus))||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw new Error('用户响应与当前租户或公开字段合同不匹配')
  return value
}
export function parseAdminReadPage(value:unknown, limit:number, offset:number):ReadPage {
  if(!record(value)||!Array.isArray(value.data)||!value.data.every(record)||!Number.isSafeInteger(value.total)||Number(value.total)<0||value.limit!==limit||value.offset!==offset||value.data.length>limit||offset+value.data.length>Math.max(Number(value.total),offset))throw new Error('列表合同不匹配；不会将异常响应当成空表')
  return value as ReadPage
}
const restrictedKey=/password|secret|token|hash|payload|request|response|authorization|privatekey/i
const publicValue=(value:unknown,depth=0):unknown=>depth>6?'层级省略':Array.isArray(value)?value.slice(0,50).map(x=>publicValue(x,depth+1)):record(value)?Object.fromEntries(Object.entries(value).filter(([key])=>!restrictedKey.test(key)||key==='contentHash').map(([key,v])=>[key,publicValue(v,depth+1)])):value
const visibleValue=(value:unknown):string=>value===null||value===undefined?'未设置':typeof value==='object'?JSON.stringify(publicValue(value)):String(value)
function Detail({value}:{value:Row}) {
  const blocked=/password|secret|token|hash|payload|request|response|authorization|privatekey/i
  return <dl className="treasury-summary-grid">{Object.entries(value).filter(([key])=>!blocked.test(key)||key==='contentHash').map(([key,item])=><div key={key}><dt>{key}</dt><dd>{visibleValue(item)}</dd></div>)}</dl>
}

export function FullAdminReadWorkspace({session,tenantId,page,onUnauthorized,onSelectUser,onSelectTrace}:{session:AdminSession;tenantId:string;page:'merchanttesting'|'api'|'sandbox'|'users';onUnauthorized:()=>void;onSelectUser?:(userId:string)=>void;onSelectTrace?:(traceId:string)=>void}) {
  const choices:ReadSurface[]=page==='users'?['users']:page==='merchanttesting'?['merchants','payments']:page==='api'?['clients','events']:['evidence']
  const [surface,setSurface]=useState<ReadSurface>(choices[0])
  const [filters,setFilters]=useState<AdminReadQuery>({limit:25,offset:0})
  const [result,setResult]=useState<{scope:string;page:ReadPage}|null>(null)
  const [detail,setDetail]=useState<{scope:string;value:Row;kind:ReadSurface}|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [refresh,setRefresh]=useState(0)
  const scope=`${session.accessToken}\u0000${session.user.id}\u0000${tenantId}\u0000${session.user.environment}\u0000${session.expiresAt}\u0000${surface}\u0000${JSON.stringify(filters)}`
  const current=useRef(scope);current.current=scope
  const sequence=useRef(0),detailAbort=useRef<AbortController|null>(null)
  const environment=session.user.environment
  const allowed=tenantId===session.user.tenantId&&['SANDBOX','TEST'].includes(environment)&&Date.parse(session.expiresAt)>Date.now()&&session.user.permissions.some(x=>x==='*'||x==='admin:*'||x==='admin:read')
  const visible=allowed&&result?.scope===scope?result.page:null
  const selected=allowed&&detail?.scope===scope?detail.value:null
  const selectedKind=detail?.kind??surface
  const title=surfaces[surface].title
  const fail=(e:unknown)=>{if(e instanceof ApiError&&e.status===401)onUnauthorized();setError(e instanceof Error?e.message:'读取失败；不使用替代数据')}
  useEffect(()=>{const controller=new AbortController(),ticket=++sequence.current;setResult(null);setDetail(null);setError('');detailAbort.current?.abort();if(!allowed){setBusy(false);return}setBusy(true)
    const fetchData=async()=>{
      let data:unknown
      if(surface==='users')data=await productionApi.adminUsers(DEFAULT_API,session.accessToken,tenantId,environment,filters,controller.signal)
      else if(surface==='merchants')data=await productionApi.merchants(DEFAULT_API,session.accessToken,tenantId,environment,filters,controller.signal)
      else if(surface==='payments')data=await productionApi.merchantPayments(DEFAULT_API,session.accessToken,tenantId,environment,filters,controller.signal)
      else if(surface==='evidence')data=await productionApi.evidence(DEFAULT_API,session.accessToken,tenantId,environment,filters,controller.signal)
      else data=await (surface==='clients'?productionApi.apiClients(DEFAULT_API,session.accessToken,tenantId,filters,controller.signal):productionApi.events(DEFAULT_API,session.accessToken,tenantId,environment,filters,controller.signal))
      if(controller.signal.aborted||current.current!==scope||ticket!==sequence.current||Date.parse(session.expiresAt)<=Date.now())return
      let next:ReadPage
      next=parseAdminReadPage(data,filters.limit??25,filters.offset??0); if(surface==='users')next.data.forEach(row=>parseAdminUserRecord(row,tenantId,environment))
      setResult({scope,page:next})
    };void fetchData().catch(e=>{if(!controller.signal.aborted&&current.current===scope&&ticket===sequence.current)fail(e)}).finally(()=>{if(!controller.signal.aborted&&current.current===scope&&ticket===sequence.current)setBusy(false)})
    return()=>{controller.abort();detailAbort.current?.abort()}
  },[scope,filters,refresh,allowed])
  useEffect(()=>()=>{sequence.current++;detailAbort.current?.abort()},[])
  const choose=(next:ReadSurface)=>{setSurface(next);setFilters({limit:25,offset:0});setResult(null);setDetail(null);setError('')}
  const open=async(row:Row,kind:ReadSurface=surface)=>{const id=kind==='users'?row.userId:row.id;if(!allowed||busy||!id)return;detailAbort.current?.abort();const controller=new AbortController();detailAbort.current=controller;setDetail(null);setError('')
    try{const value=kind==='users'?parseAdminUserRecord(await productionApi.adminUserDirectoryDetail(DEFAULT_API,session.accessToken,tenantId,environment,String(id),controller.signal),tenantId,environment,String(id)):kind==='clients'?await productionApi.apiClient(DEFAULT_API,session.accessToken,tenantId,String(id),controller.signal):kind==='events'?await productionApi.event(DEFAULT_API,session.accessToken,tenantId,environment,String(id),controller.signal):kind==='merchants'?await productionApi.merchantDetail(DEFAULT_API,session.accessToken,tenantId,environment,String(id),controller.signal):kind==='payments'?await productionApi.merchantPaymentDetail(DEFAULT_API,session.accessToken,tenantId,environment,String(id),controller.signal):row
      if(controller.signal.aborted||current.current!==scope||detailAbort.current!==controller||Date.parse(session.expiresAt)<=Date.now())return
      if(!record(value))throw new Error('详情合同不匹配');setDetail({scope,value,kind})
    }catch(e){if(!controller.signal.aborted&&current.current===scope)fail(e)}
  }
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget),next:AdminReadQuery={limit:Number(form.get('limit')||25),offset:0};for(const key of ['search','status','merchantId','assetCode','from','to','category','result','operation','traceId','kycStatus'] as const){const value=String(form.get(key)||'').trim();if(value)Object.assign(next,{[key]:value})}setFilters(next)}
  return <section><div className="workspace-tabs">{choices.map(key=><button key={key} type="button" aria-pressed={surface===key} onClick={()=>choose(key)}>{surfaces[key].title}</button>)}</div><article className="panel"><div className="panel-title"><div><h3>{title}</h3><p>当前认证租户与环境 · 只读；真实空结果、失败与尚未验证分别显示。</p></div><button type="button" disabled={!allowed||busy} onClick={()=>setRefresh(x=>x+1)}>刷新</button></div>{!allowed&&<p role="alert">当前会话、租户或环境不允许读取。</p>}<form key={surface} className="admin-write-grid" onSubmit={submit}>
    {(surface==='users'||surface==='merchants'||surface==='clients'||surface==='events')&&<label>{surface==='users'?'用户 ID 搜索':'搜索'}<input name="search" maxLength={100}/></label>}
    {surface==='users'&&<label>KYC 状态<select name="kycStatus"><option value="">全部</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></select></label>}
    {(surface==='merchants'||surface==='payments')&&<label>状态<input name="status" pattern="[A-Z_]+" placeholder="留空为全部"/></label>}
    {surface==='payments'&&<><label>商户 ID<input name="merchantId"/></label><label>币种<input name="assetCode" pattern="[A-Z0-9]+"/></label><label>开始日期<input name="from" type="date"/></label><label>结束日期<input name="to" type="date"/></label></>}
    {surface==='evidence'&&<><label>类别<input name="category" pattern="[A-Z_]+"/></label><label>结果<select name="result"><option value="">全部</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option></select></label><label>操作<input name="operation"/></label><label>Trace ID<input name="traceId"/></label></>}
    <label>每页<select name="limit" defaultValue="25"><option>10</option><option>25</option><option>50</option></select></label><button disabled={!allowed||busy}>应用筛选</button></form>
    {surface==='events'&&<p>当前租户 FASTLINK_DOMAIN 事件：筛选、总数和分页来自服务端，不以最近200条本地切片冒充全量。</p>}
    {surface==='clients'&&<p>仅显示客户端及密钥状态元数据，不显示密钥原值或哈希。</p>}
    {surface==='users'&&<p>只显示当前已授权的五个公开字段；姓名、邮箱、启停状态未获取，不使用空值冒充已读取。</p>}
    {busy&&<p role="status">正在读取…</p>}{error&&<p role="alert" className="inline-error">{error}</p>}
    {visible&&<><p>{surface==='events'?'本次返回并匹配':'匹配记录'} {visible.total} · 偏移 {visible.offset}</p><div className="table-wrap"><table><thead><tr>{surfaces[surface].columns.map(key=><th key={key}>{key}</th>)}<th>详情 / 关联</th></tr></thead><tbody>{visible.data.map((row,index)=><tr key={String(row.id??index)}>{surfaces[surface].columns.map(key=><td key={key}>{visibleValue(row[key])}</td>)}<td><button type="button" disabled={busy} onClick={()=>void open(row)}>查看</button></td></tr>)}</tbody></table></div>{!visible.data.length&&<p>服务端或当前筛选返回零条；未据此证明详情、关联及正向样本已验收。</p>}<div className="workspace-tabs"><button disabled={busy||visible.offset===0} onClick={()=>setFilters({...filters,offset:Math.max(0,visible.offset-visible.limit)})}>上一页</button><button disabled={busy||visible.offset+visible.data.length>=visible.total} onClick={()=>setFilters({...filters,offset:visible.offset+visible.limit})}>下一页</button></div></>}
    {selected&&<section className="panel"><h4>{selectedKind==='evidence'?'本页证据记录摘要（未调用独立详情接口）':'已重新读取对象详情'}</h4><Detail value={selected}/>{selectedKind==='users'&&onSelectUser&&<button onClick={()=>onSelectUser(String(selected.userId))}>查看此用户 KYC</button>}{selectedKind==='merchants'&&typeof selected.id==='string'&&<button onClick={()=>{setSurface('payments');setFilters({limit:25,offset:0,merchantId:String(selected.id)});setResult(null);setDetail(null)}}>查看该商户支付历史</button>}{selectedKind==='payments'&&typeof selected.merchantId==='string'&&/^[A-Za-z0-9_-]{2,128}$/.test(selected.merchantId)&&<button onClick={()=>void open({id:selected.merchantId},'merchants')}>读取所属商户</button>}{onSelectTrace&&typeof selected.traceId==='string'&&/^[A-Za-z0-9._:-]{8,128}$/.test(selected.traceId)&&<button onClick={()=>onSelectTrace(selected.traceId as string)}>查询关联 Trace</button>}<button onClick={()=>setDetail(null)}>关闭详情</button></section>}
    <fieldset disabled><legend>业务写入保持冻结</legend>{(page==='users'?['注册用户','修改 KYC','启用或停用用户']:page==='merchanttesting'?['创建商户','支付','清算','结算','退款']:page==='api'?['创建客户端','轮换密钥','撤销密钥','重放事件']:['新增证据']).map(action=><button key={action} type="button">{action}</button>)}</fieldset>
  </article></section>
}
