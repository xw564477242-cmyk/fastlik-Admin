import {FormEvent,useState} from 'react'
import {Building2,Eye,EyeOff,KeyRound,LockKeyhole,ShieldCheck} from 'lucide-react'

export type AdminRole='Platform Super Admin'|'Tenant Administrator'|'Treasury Operator'|'Compliance Officer'|'Developer'|'Read Only Auditor'
export type AdminSession={email:string;role:AdminRole;tenant:string}

const roles:AdminRole[]=['Platform Super Admin','Tenant Administrator','Treasury Operator','Compliance Officer','Developer','Read Only Auditor']

export default function LoginScreen({onLogin}:{onLogin:(session:AdminSession)=>void}){
 const[email,setEmail]=useState('admin@fastlink.test')
 const[password,setPassword]=useState('FastLink2026!')
 const[role,setRole]=useState<AdminRole>('Platform Super Admin')
 const[tenant,setTenant]=useState('FastLink Platform')
 const[show,setShow]=useState(false)
 const[error,setError]=useState('')
 const submit=(event:FormEvent)=>{event.preventDefault();if(!/^\S+@\S+\.\S+$/.test(email)){setError('请输入有效的管理员邮箱');return}if(password.length<8){setError('密码至少需要8位');return}setError('');onLogin({email,role,tenant:role==='Tenant Administrator'?tenant:'FastLink Platform'})}
 return <main className="login-page"><section className="login-story"><div className="login-brand"><span>F</span><div><b>FastLink</b><small>FINANCIAL SAAS CONTROL</small></div></div><div className="login-copy"><small>FASTLINK PLATFORM CONTROL PLANE</small><h1>多租户金融平台<br/>统一运营入口</h1><p>管理合作方、U卡项目、钱包、资金池、清算、风控、API与白标交付。</p><div className="login-points"><span><Building2/>租户数据隔离</span><span><LockKeyhole/>RBAC权限控制</span><span><ShieldCheck/>敏感操作审计</span></div></div><footer>Sandbox Environment · No real funds</footer></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><div className="login-form-head"><span><KeyRound/></span><h2>登录管理后台</h2><p>请选择角色进入对应的权限范围</p></div><label>管理员邮箱<input value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>密码<div className="password-field"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label><label>模拟角色<select value={role} onChange={e=>setRole(e.target.value as AdminRole)}>{roles.map(x=><option key={x}>{x}</option>)}</select></label>{role==='Tenant Administrator'&&<label>所属租户<select value={tenant} onChange={e=>setTenant(e.target.value)}><option>NovaPay Asia</option><option>Orbit Card Labs</option><option>BluePeak Finance</option></select></label>}{error&&<p className="login-error">{error}</p>}<button className="login-submit" type="submit">进入 FastLink Sandbox</button><p className="login-hint">测试账号已预填。当前登录只用于前端Sandbox权限验收。</p></form></section></main>
}
