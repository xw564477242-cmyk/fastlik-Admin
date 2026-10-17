import { runtimeConfig } from './runtimeConfig'
import { useEffect, useState } from 'react'
import { apiRequest, ApiError, type AdminSession } from './productionApi'

type User = { userId:string;tenantId:string;environment:'TEST';email:string;firstName:string;lastName:string;kycStatus:'PENDING'|'APPROVED'|'REJECTED';isActive:boolean;createdAt:string }
const fields = ['userId','tenantId','environment','email','firstName','lastName','kycStatus','isActive','createdAt'].sort().join(',')
function parseUser(v:unknown, tenant:string):User {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('用户响应无效')
  const p=v as Record<string,unknown>
  if (Object.keys(p).sort().join(',')!==fields || p.tenantId!==tenant || p.environment!=='TEST' || typeof p.userId!=='string'
    || !/^[A-Za-z0-9_-]{2,128}$/.test(p.userId) || !['PENDING','APPROVED','REJECTED'].includes(String(p.kycStatus))
    || typeof p.isActive!=='boolean' || typeof p.email!=='string' || typeof p.firstName!=='string' || typeof p.lastName!=='string'
    || typeof p.createdAt!=='string' || !Number.isFinite(Date.parse(p.createdAt))) throw Error('用户响应身份或字段不匹配')
  return p as User
}
export function B10Users({session,review,invalidateSession}:{session:AdminSession;review:boolean;invalidateSession:(token:string)=>void}) {
  const [users,setUsers]=useState<User[]>([]),[selected,setSelected]=useState<User|null>(null),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const base=`/admin/tenants/${encodeURIComponent(session.user.tenantId)}/users`
  const expired=!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt)<=Date.now()
  const read=(path:string,method='GET',body?:unknown,signal?:AbortSignal)=>apiRequest<string>(path,session.accessToken,method,body,{format:'bounded-text',maxBytes:32768},signal)
  function fail(e:unknown){setMessage(e instanceof Error?e.message:'操作不可用');if(e instanceof ApiError && e.status===401)invalidateSession(session.accessToken)}
  useEffect(()=>{
    const controller=new AbortController()
    if(expired || session.user.environment!=='TEST'){setMessage('会话已过期或环境不可用');return}
    setBusy(true)
    read(`${base}?environment=TEST`,'GET',undefined,controller.signal).then(raw=>{
      const v=JSON.parse(raw) as {records?:unknown[];truncated?:unknown}
      if(!v || Object.keys(v).sort().join(',')!=='records,truncated' || !Array.isArray(v.records) || v.records.length>25 || typeof v.truncated!=='boolean')throw Error('用户列表响应无效')
      const rows=v.records.map(x=>parseUser(x,session.user.tenantId))
      if(new Set(rows.map(x=>x.userId)).size!==rows.length)throw Error('用户列表重复')
      if(!controller.signal.aborted){setUsers(rows);setMessage(v.truncated?'仅显示前25条':'已读取当前租户用户')}
    }).catch(e=>{if(!controller.signal.aborted)fail(e)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})
    return()=>controller.abort()
  },[base,session.accessToken,session.expiresAt])
  async function detail(userId:string){setBusy(true);setMessage('');try{setSelected(parseUser(JSON.parse(await read(`${base}/${encodeURIComponent(userId)}?environment=TEST`)),session.user.tenantId))}catch(e){setSelected(null);fail(e)}finally{setBusy(false)}}
  async function decide(status:'APPROVED'|'REJECTED'){
    if(runtimeConfig.previewReadOnly || !selected || busy || expired || !session.user.permissions.includes('kyc:review') || reason.trim().length<2)return
    setBusy(true);setMessage('')
    try{
      const user=parseUser(JSON.parse(await read(`${base}/${encodeURIComponent(selected.userId)}/kyc`,'PATCH',{status,reason:reason.trim()})),session.user.tenantId)
      setSelected(user);setUsers(rows=>rows.map(x=>x.userId===user.userId?user:x));setMessage('审核结果已持久化；不调用外部KYC服务')
    }catch(e){fail(e)}finally{setBusy(false)}
  }
  return <section aria-label={review?'KYC审核':'用户管理'}>
    <h2>{review?(runtimeConfig.previewReadOnly?'KYC 状态（只读）':'KYC 审核'):'用户管理'}</h2><p role="status">{message}</p>
    {users.length===0&&!busy&&<p>当前租户暂无可见用户。</p>}
    <table><thead><tr><th>用户</th><th>邮箱</th><th>KYC</th><th>操作</th></tr></thead><tbody>{users.map(u=><tr key={u.userId}><td>{u.firstName} {u.lastName}</td><td>{u.email}</td><td>{u.kycStatus}</td><td><button disabled={busy||expired} onClick={()=>void detail(u.userId)}>查看详情</button></td></tr>)}</tbody></table>
    {selected&&<article><h3>用户详情</h3><dl><dt>用户编号</dt><dd>{selected.userId}</dd><dt>租户</dt><dd>{selected.tenantId}</dd><dt>邮箱</dt><dd>{selected.email}</dd><dt>状态</dt><dd>{selected.isActive?'启用':'停用'}</dd><dt>KYC</dt><dd>{selected.kycStatus}</dd></dl>
      {review&&!runtimeConfig.previewReadOnly&&<fieldset disabled={busy||expired||!session.user.permissions.includes('kyc:review')}><legend>当前租户 KYC 审核</legend>
        <label>审核原因<input aria-label="审核原因" value={reason} minLength={2} maxLength={240} onChange={e=>setReason(e.target.value)}/></label>
        <button disabled={reason.trim().length<2} onClick={()=>void decide('APPROVED')}>批准 KYC</button>
        <button disabled={reason.trim().length<2} onClick={()=>void decide('REJECTED')}>拒绝 KYC</button>
      </fieldset>}
    </article>}
  </section>
}
