import {useEffect,useMemo,useState} from 'react'
import {Check,Filter,KeyRound,LoaderCircle,LockKeyhole,Plus,Search,ShieldCheck,Users} from 'lucide-react'
import {createRoleManagementAdapter,type AdapterSource,type ManagedRole,type Permission,type RoleManagementAdapter,type RoleScope} from './roleManagementAdapter'
import {getAdminKey,setAdminKey} from './walletBusinessApi'

type Props={notify:(message:string)=>void}

export default function RoleManagement({notify}:Props){
 const[key,setKey]=useState(getAdminKey())
 const[adapter,setAdapter]=useState<RoleManagementAdapter>(()=>createRoleManagementAdapter(getAdminKey()))
 const[roles,setRoles]=useState<ManagedRole[]>([])
 const[permissions,setPermissions]=useState<Permission[]>([])
 const[source,setSource]=useState<AdapterSource>('MOCK')
 const[notice,setNotice]=useState('')
 const[query,setQuery]=useState('')
 const[scope,setScope]=useState('ALL')
 const[status,setStatus]=useState('ALL')
 const[newName,setNewName]=useState('Operations Analyst')
 const[newScope,setNewScope]=useState<RoleScope>('TENANT')
 const[busy,setBusy]=useState('')
 const[error,setError]=useState('')
 const visibleRoles=useMemo(()=>roles.filter(role=>(scope==='ALL'||role.scope===scope)&&(status==='ALL'||role.status===status)&&`${role.id} ${role.name} ${role.scope}`.toLowerCase().includes(query.toLowerCase())),[query,roles,scope,status])

 const load=async(nextAdapter=adapter)=>{setBusy('load');setError('');try{const[nextRoles,nextPermissions]=await Promise.all([nextAdapter.listRoles(),nextAdapter.listPermissions()]);setRoles(nextRoles.data);setPermissions(nextPermissions.data);setSource(nextRoles.source);setNotice(nextRoles.notice||nextPermissions.notice||'')}catch(e){setError(e instanceof Error?e.message:'角色数据加载失败')}finally{setBusy('')}}
 useEffect(()=>{void load()},[])
 const connect=async()=>{setAdminKey(key);const next=createRoleManagementAdapter(key);setAdapter(next);await load(next);notify(key?'Role Management Adapter 已连接':'已切换 Mock Adapter')}
 const update=async(next:ManagedRole)=>{if(next.name==='Platform Super Admin'){notify('Platform Super Admin 为受保护系统角色');return}setBusy(next.id);setError('');try{const result=await adapter.updateRole({...next,updatedAt:new Date().toISOString()});setRoles(value=>value.map(role=>role.id===result.data.id?result.data:role));setSource(result.source);setNotice(result.notice||'');notify(`${next.name} 已更新`)}catch(e){setError(e instanceof Error?e.message:'角色更新失败')}finally{setBusy('')}}
 const togglePermission=(role:ManagedRole,permissionId:string)=>void update({...role,permissionIds:role.permissionIds.includes(permissionId)?role.permissionIds.filter(id=>id!==permissionId):[...role.permissionIds,permissionId]})
 const create=async()=>{if(newName.trim().length<3){setError('角色名称至少 3 个字符');return}setBusy('create');setError('');try{const result=await adapter.createRole({name:newName.trim(),scope:newScope});setRoles(value=>[...value,result.data]);setSource(result.source);setNotice(result.notice||'');setNewName('Operations Analyst');notify('Sandbox 角色已创建')}catch(e){setError(e instanceof Error?e.message:'角色创建失败')}finally{setBusy('')}}

 return <div className="s07-page">
  <header className="s07-head"><div><span>SPRINT‑07 · ROLE MANAGEMENT</span><h2>角色、权限矩阵与职责分离</h2><p>保留现有 Admin RBAC 导航边界，通过统一 Adapter 管理 Mock 与未来 Backend RBAC。</p></div><div className={`s07-adapter ${source.toLowerCase()}`}><i/>{source.replace('_',' ')}</div></header>
  <section className="s07-connect panel"><KeyRound/><input type="password" value={key} onChange={event=>setKey(event.target.value)} placeholder="ADMIN_API_KEY（仅当前浏览器会话）"/><button onClick={()=>void connect()} disabled={busy==='load'}>{busy==='load'?<LoaderCircle className="spin"/>:'连接 Adapter'}</button><small>无 Key 使用 Mock；Backend RBAC 未启用时自动回退，不影响现有权限。</small></section>
  {notice&&<div className="s07-notice">{notice}</div>}{error&&<div className="s06-error">{error}</div>}
  <section className="s07-metrics"><article><Users/><span>角色</span><strong>{roles.length}</strong><small>{roles.reduce((sum,role)=>sum+role.members,0)} 位成员</small></article><article><ShieldCheck/><span>权限</span><strong>{permissions.length}</strong><small>{permissions.filter(value=>value.risk==='HIGH').length} 项高风险</small></article><article><LockKeyhole/><span>启用角色</span><strong>{roles.filter(role=>role.status==='ACTIVE').length}</strong><small>Platform Super Admin 受保护</small></article><article><Filter/><span>当前结果</span><strong>{visibleRoles.length}</strong><small>支持搜索和筛选</small></article></section>
  <section className="panel s07-create"><div><h3><Plus/>创建 Sandbox 角色</h3><p>新角色默认只有 Tenant Read 权限，需在矩阵中明确授权。</p></div><input value={newName} onChange={event=>setNewName(event.target.value)} placeholder="角色名称"/><select value={newScope} onChange={event=>setNewScope(event.target.value as RoleScope)}>{['PLATFORM','TENANT','TREASURY','COMPLIANCE','SANDBOX','READ_ONLY'].map(value=><option key={value}>{value}</option>)}</select><button onClick={()=>void create()} disabled={busy==='create'}>{busy==='create'?'创建中…':'创建角色'}</button></section>
  <article className="panel s07-role-list"><div className="s07-tools"><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索角色、ID、范围"/></label><select value={scope} onChange={event=>setScope(event.target.value)}><option value="ALL">全部范围</option>{['PLATFORM','TENANT','TREASURY','COMPLIANCE','SANDBOX','READ_ONLY'].map(value=><option key={value}>{value}</option>)}</select><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">全部状态</option><option>ACTIVE</option><option>DISABLED</option></select></div><table><thead><tr><th>角色</th><th>范围</th><th>成员</th><th>权限数</th><th>状态</th><th>操作</th></tr></thead><tbody>{visibleRoles.map(role=><tr key={role.id}><td><b>{role.name}</b><small>{role.id}{role.system?' · SYSTEM':''}</small></td><td>{role.scope}</td><td>{role.members}</td><td>{role.permissionIds.length}/{permissions.length}</td><td><span className={`s06-status ${role.status==='ACTIVE'?'active':'disabled'}`}>{role.status}</span></td><td><button disabled={role.name==='Platform Super Admin'||busy===role.id} onClick={()=>void update({...role,status:role.status==='ACTIVE'?'DISABLED':'ACTIVE'})}>{role.status==='ACTIVE'?'停用':'启用'}</button></td></tr>)}</tbody></table></article>
  <article className="panel s07-matrix"><div className="panel-title"><div><h3>Permission Matrix</h3><p>勾选即通过当前 Adapter 更新；Platform Super Admin 权限不可降级。</p></div></div><div className="s07-matrix-scroll"><table><thead><tr><th>权限</th>{visibleRoles.map(role=><th key={role.id}>{role.name}</th>)}</tr></thead><tbody>{permissions.map(permission=><tr key={permission.id}><td><b>{permission.module} · {permission.action}</b><small>{permission.description} · {permission.risk}</small></td>{visibleRoles.map(role=><td key={`${role.id}-${permission.id}`}><button className={role.permissionIds.includes(permission.id)?'granted':''} disabled={role.name==='Platform Super Admin'||busy===role.id} aria-label={`${role.name} ${permission.id}`} onClick={()=>togglePermission(role,permission.id)}>{role.permissionIds.includes(permission.id)&&<Check/>}</button></td>)}</tr>)}</tbody></table></div></article>
 </div>
}
