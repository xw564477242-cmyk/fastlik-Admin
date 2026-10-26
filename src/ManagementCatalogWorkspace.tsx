import { FormEvent, useEffect, useRef, useState } from 'react'
import { ApiError, DEFAULT_API, productionApi, type AdminSession, type AdminReadQuery } from './productionApi'
import { runtimeConfig } from './runtimeConfig'

type Mode='branding'|'products'|'audit'|'capabilities'|'roles'
type Row=Record<string,unknown>
type Page={data:Row[];total:number;limit:number;offset:number}
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v)
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{2,128}$/.test(v)
const columns:Record<'products'|'audit'|'roles',string[]>={
 roles:['id','code'],
 products:['id','code','name','cardType','currency','active'],
 audit:['id','createdAt','actorType','action','resource','resourceId','requestId'],
}
const allowedKeys={
 roles:['id','code','tenantId','environment'],
 members:['id','userId','tenantId','environment','isActive','startsAt','expiresAt','revokedAt'],
 permissions:['id','scope','tenantId','environment'],
 products:['id','tenantId','environment','code','name','cardType','currency','active','cardIssueFee','cardMonthlyFee','usdtDepositRate','cardSpendRate','assetWithdrawRate','cashWithdrawRate','thirdPartyPayRate','referralFeeRate','effectiveAt','createdAt','updatedAt'],
 audit:['id','tenantId','environment','actorType','action','resource','resourceId','requestId','createdAt'],
 branding:['id','legalName','brandName','slug','status','environment','createdAt','updatedAt'],
}
const publicAudit=(r:Row)=>
 r.resource==='HTTP_REQUEST'&&r.action==='GET /api/v1/cards'&&r.actorType==='END_USER'
 ||r.resource==='SUPPORT_CASE'&&['SUPPORT_CASE_CREATED','SUPPORT_CASE_MANAGED','SUPPORT_CASE_CLOSED'].includes(String(r.action))
 ||['WalletOperation','MerchantPayment','Card','CardTransaction','Journal','SettlementBatch'].includes(String(r.resource))&&!/(LOGIN|LOGOUT|AUTH|TOKEN|SESSION|PASSWORD|PIN|CVV|KEY)/i.test(String(r.action))
export function parseCatalogRow(raw:unknown,mode:'products'|'audit'|'roles'|'members'|'permissions',tenantId:string,environment:string,expectedId?:string):Row{
 if(!object(raw)||!id(raw.id)||raw.tenantId!==tenantId||raw.environment!==environment||expectedId!==undefined&&raw.id!==expectedId||Object.keys(raw).some(k=>!allowedKeys[mode].includes(k)))throw new Error('对象与当前租户、环境或公开字段合同不匹配')
 const required=mode==='products'?['id','tenantId','environment','code','name','cardType','currency','active']:allowedKeys[mode]
 if(required.some(k=>!(k in raw)))throw new Error('公开对象缺少必要字段')
 if(mode==='audit'&&(!publicAudit(raw)||typeof raw.action!=='string'||typeof raw.actorType!=='string'||typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))))throw new Error('审计记录超出已批准的非认证行范围')
 if(mode==='products'){
  if(!['VIRTUAL','PHYSICAL'].includes(String(raw.cardType))||typeof raw.code!=='string'||typeof raw.name!=='string'||typeof raw.active!=='boolean'||typeof raw.currency!=='string'||!/^[A-Z]{3}$/.test(raw.currency))throw new Error('产品公开字段格式不匹配')
  for(const k of ['cardIssueFee','cardMonthlyFee','usdtDepositRate','cardSpendRate','assetWithdrawRate','cashWithdrawRate','thirdPartyPayRate','referralFeeRate'])if(raw[k]!==undefined&&raw[k]!==null&&(typeof raw[k]!=='string'||!/^\d{1,36}(?:\.\d{1,18})?$/.test(raw[k] as string)))throw new Error('费用必须为十进制字符串')
 }
 if(mode==='roles'&&typeof raw.code!=='string'||mode==='members'&&(raw.userId!==raw.id||typeof raw.isActive!=='boolean')||mode==='permissions'&&typeof raw.scope!=='string')throw new Error('角色关联公开字段不匹配')
 for(const value of Object.values(raw))if(value!==null&&!['string','number','boolean'].includes(typeof value))throw new Error('公开对象字段格式不匹配')
 return raw
}
const visible=(v:unknown)=>v===null||v===undefined?'未设置':String(v)
function Details({value}:{value:Row}){return <dl className="treasury-summary-grid">{Object.entries(value).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{visible(v)}</dd></div>)}</dl>}
export function ManagementCatalogWorkspace({session,tenantId,mode,onUnauthorized,onNavigate,onSelectTrace}:{session:AdminSession;tenantId:string;mode:Mode;onUnauthorized:()=>void;onNavigate?:(page:string)=>void;onSelectTrace?:(trace:string)=>void}){
 const [filters,setFilters]=useState<AdminReadQuery>({limit:10,offset:0})
 const [result,setResult]=useState<{scope:string;page?:Page;row?:Row;capabilities?:Row[];gaps?:string[]}|null>(null)
 const [related,setRelated]=useState<{scope:string;roleId:string;kind:'members'|'permissions';page:Page}|null>(null)
 const [detail,setDetail]=useState<{scope:string;row:Row}|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0)
 const scope=[session.accessToken,session.user.id,tenantId,session.user.environment,session.expiresAt,mode,JSON.stringify(filters)].join('\u0000')
 const current=useRef(scope);current.current=scope
 const detailAbort=useRef<AbortController|null>(null)
 const allowed=runtimeConfig.previewReadOnly&&tenantId===session.user.tenantId&&tenantId==='b9_tenant_A_20261016'&&session.user.environment==='TEST'&&Date.parse(session.expiresAt)>Date.now()&&session.user.permissions.some(p=>['*','admin:*','admin:read'].includes(p))
 const shown=allowed&&result?.scope===scope?result:null,selected=allowed&&detail?.scope===scope?detail.row:null
 const fail=(e:unknown)=>{if(e instanceof ApiError&&e.status===401)onUnauthorized();setError(e instanceof Error?e.message:'读取失败')}
 useEffect(()=>{const abort=new AbortController();detailAbort.current?.abort();setResult(null);setDetail(null);setRelated(null);setError('');setBusy(false);if(!allowed)return;setBusy(true)
  void productionApi.managementRead(DEFAULT_API,session.accessToken,tenantId,session.user.environment,mode,filters,abort.signal).then((raw:unknown)=>{
   if(abort.signal.aborted||current.current!==scope||Date.parse(session.expiresAt)<=Date.now())return
   if(!object(raw))throw new Error('管理读取合同不匹配')
   if(mode==='branding'){
    if(raw.tenantId!==tenantId||raw.environment!==session.user.environment||!object(raw.branding)||raw.branding.id!==tenantId||raw.branding.environment!==session.user.environment||Object.keys(raw.branding).some(k=>!allowedKeys.branding.includes(k))||!Array.isArray(raw.unavailableFields)||!raw.unavailableFields.every(x=>typeof x==='string'))throw new Error('品牌读取合同不匹配')
    setResult({scope,row:raw.branding,gaps:raw.unavailableFields as string[]});return
   }
   if(mode==='capabilities'){
    if(raw.tenantId!==tenantId||raw.environment!==session.user.environment||raw.kind!=='SOURCE_CONTRACT_MAP'||raw.runtimeHealthVerified!==false||!Array.isArray(raw.data)||raw.data.length>30||!raw.data.every(r=>object(r)&&Object.keys(r).every(k=>['module','page','contract','basis','scope'].includes(k))&&Object.values(r).every(v=>v===null||typeof v==='string')))throw new Error('源码合同地图不匹配')
    setResult({scope,capabilities:raw.data as Row[]});return
   }
   if(!Array.isArray(raw.data)||!Number.isSafeInteger(raw.total)||Number(raw.total)<0||raw.limit!==filters.limit||raw.offset!==filters.offset||raw.data.length>Number(filters.limit)||Number(raw.offset)+raw.data.length>Math.max(Number(raw.total),Number(raw.offset)))throw new Error('目录分页合同不匹配')
   const data=raw.data.map(r=>parseCatalogRow(r,mode,tenantId,session.user.environment))
   setResult({scope,page:{data,total:Number(raw.total),limit:Number(raw.limit),offset:Number(raw.offset)}})
  }).catch((e:unknown)=>{if(!abort.signal.aborted&&current.current===scope)fail(e)}).finally(()=>{if(!abort.signal.aborted&&current.current===scope)setBusy(false)})
  return()=>{abort.abort();detailAbort.current?.abort()}
 },[scope,allowed,refresh])
 const readDetail=async(row:Row)=>{if(!allowed||busy||!(mode==='products'||mode==='audit'||mode==='roles'))return;detailAbort.current?.abort();const abort=new AbortController();detailAbort.current=abort;setDetail(null);setRelated(null);setError('')
  try{const raw=await productionApi.managementDetail(DEFAULT_API,session.accessToken,tenantId,session.user.environment,mode,String(row.id),abort.signal);if(abort.signal.aborted||current.current!==scope||Date.parse(session.expiresAt)<=Date.now())return;setDetail({scope,row:parseCatalogRow(raw,mode,tenantId,session.user.environment,String(row.id))})}catch(e){if(!abort.signal.aborted&&current.current===scope)fail(e)}
 }
 const readRelated=async(roleId:string,kind:'members'|'permissions',offset=0)=>{if(!allowed||mode!=='roles'||!id(roleId)||selected?.id!==roleId)return;detailAbort.current?.abort();const abort=new AbortController();detailAbort.current=abort;setError('')
  try{const raw=await productionApi.managementRoleRelated(DEFAULT_API,session.accessToken,tenantId,session.user.environment,roleId,kind,{limit:10,offset},abort.signal);if(abort.signal.aborted||current.current!==scope||Date.parse(session.expiresAt)<=Date.now())return
   if(!object(raw)||!Array.isArray(raw.data)||raw.data.length>10||!Number.isSafeInteger(raw.total)||Number(raw.total)<0||raw.limit!==10||raw.offset!==offset)throw new Error('角色关联分页合同不匹配')
   setRelated({scope,roleId,kind,page:{data:raw.data.map(row=>parseCatalogRow(row,kind,tenantId,session.user.environment)),total:Number(raw.total),limit:10,offset}})
  }catch(e){if(!abort.signal.aborted&&current.current===scope)fail(e)}
 }
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=new FormData(e.currentTarget),q:AdminReadQuery={limit:Number(form.get('limit')||10),offset:0};for(const name of ['search','resource','action','requestId'] as const){const value=String(form.get(name)||'').trim();if(value)q[name]=value}setFilters(q)}
 const title={branding:'当前租户品牌配置',products:'产品目录与详情',audit:'非认证业务审计检索',capabilities:'子系统读取合同与页面关联',roles:'当前租户角色目录、成员与权限'}[mode]
 return <section className="panel"><div className="panel-title"><div><h3>{title}</h3><p>当前租户 TEST · 持久化只读合同；源码能力不等于运行健康。</p></div><button disabled={!allowed||busy} onClick={()=>setRefresh(n=>n+1)}>刷新</button></div>
 {!allowed&&<p role="alert">当前会话不允许此管理读取。</p>}
 {(mode==='products'||mode==='audit'||mode==='roles')&&<form onSubmit={submit} className="admin-write-grid">
 {mode!=='audit'?<label>代码 / 产品搜索<input name="search" maxLength={100}/></label>:<><label>资源<input name="resource" maxLength={100}/></label><label>操作<input name="action" maxLength={100}/></label><label>请求 / Trace ID<input name="requestId" maxLength={100}/></label></>}
 <label>每页<select name="limit" defaultValue="10"><option>10</option><option>25</option></select></label><button disabled={!allowed||busy}>应用筛选</button></form>}
 {busy&&<p role="status">正在读取…</p>}{error&&<p role="alert" className="inline-error">{error}</p>}
 {shown?.row&&<Details value={shown.row}/>}
 {shown?.gaps&&<p>当前 Tenant 合同未提供：{shown.gaps.join('、')}。不是已读取的空配置；不会伪造素材、域名或交付状态。</p>}
 {shown?.capabilities&&<><p>以下为服务端源码合同清单，不进行外部探测，不把它标记为运行验收通过。</p><table><thead><tr><th>模块</th><th>合同与依据</th><th>范围</th><th>关联</th></tr></thead><tbody>{shown.capabilities.map(r=><tr key={String(r.module)}><td>{visible(r.module)}</td><td>{visible(r.contract)} · {visible(r.basis)}</td><td>{visible(r.scope)}</td><td>{onNavigate&&['whitelabel','programs','operations','system','permissions','revenue','funds'].includes(String(r.page))&&<button onClick={()=>onNavigate(String(r.page))}>打开模块</button>}</td></tr>)}</tbody></table></>}
 {shown?.page&&<><p>匹配记录 {shown.page.total} · 偏移 {shown.page.offset}</p><div className="table-wrap"><table><thead><tr>{columns[mode as 'products'|'audit'|'roles'].map(k=><th key={k}>{k}</th>)}<th>详情</th></tr></thead><tbody>{shown.page.data.map(r=><tr key={String(r.id)}>{columns[mode as 'products'|'audit'|'roles'].map(k=><td key={k}>{visible(r[k])}</td>)}<td><button onClick={()=>void readDetail(r)}>查看</button></td></tr>)}</tbody></table></div>
 {!shown.page.data.length&&<p>当前服务端筛选范围没有记录；未据此证明正向详情或真实操作历史已经验收。</p>}
 <div className="workspace-tabs"><button disabled={busy||shown.page.offset===0} onClick={()=>setFilters({...filters,offset:Math.max(0,shown.page!.offset-shown.page!.limit)})}>上一页</button><button disabled={busy||shown.page.offset+shown.page.data.length>=shown.page.total} onClick={()=>setFilters({...filters,offset:shown.page!.offset+shown.page!.limit})}>下一页</button></div></>}
 {selected&&<section className="panel"><h4>已重新读取详情</h4><Details value={selected}/>{mode==='roles'&&<div className="workspace-tabs"><button onClick={()=>void readRelated(String(selected.id),'members')}>读取本租户成员</button><button onClick={()=>void readRelated(String(selected.id),'permissions')}>读取角色权限</button></div>}{mode==='audit'&&onSelectTrace&&typeof selected.requestId==='string'&&/^[A-Za-z0-9._:-]{8,128}$/.test(selected.requestId)&&<button onClick={()=>onSelectTrace(selected.requestId as string)}>查询关联 Trace</button>}<button onClick={()=>{setDetail(null);setRelated(null)}}>关闭详情</button></section>}
 {selected&&related?.scope===scope&&related.roleId===selected.id&&<section className="panel"><h4>{related.kind==='members'?'本租户管理员成员（TenantUser，非终端用户 Customer）':'角色权限（不授予新权限）'}</h4><p>匹配记录 {related.page.total} · 偏移 {related.page.offset}</p>{related.page.data.map(row=><Details key={String(row.id)} value={row}/>)}{!related.page.data.length&&<p>当前角色关联范围没有记录。</p>}<button disabled={related.page.offset===0} onClick={()=>void readRelated(related.roleId,related.kind,Math.max(0,related.page.offset-10))}>关联上一页</button><button disabled={related.page.offset+related.page.data.length>=related.page.total} onClick={()=>void readRelated(related.roleId,related.kind,related.page.offset+10)}>关联下一页</button></section>}
 {mode==='roles'&&<p>仅当前租户 TEST 的持久化角色关联；目录未开放时显示服务端失败，不用当前会话角色替代。邮箱、密码和成员变更不在此只读范围。</p>}
 {mode==='audit'&&<p>仅已批准的业务审计行；不查询或显示认证审计、actorId、IP、User-Agent、raw metadata，不创建验收用历史审计。</p>}
 <fieldset disabled><legend>管理与资金写入未开放</legend><button>保存配置</button><button>新增记录</button><button>删除记录</button></fieldset>
 </section>
}

