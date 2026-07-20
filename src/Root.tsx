import {useState} from 'react'
import {FlaskConical,X} from 'lucide-react'
import App from './App'
import SimulationCenter from './SimulationCenter'
import SubsystemApplications from './SubsystemApplications'
import TreasuryOperationsCenter from './TreasuryOperationsCenter'
import WalletBusinessCenter from './WalletBusinessCenter'
import TenantOperationsCenter from './TenantOperationsCenter'
import WhiteLabelDeliveryCenter from './WhiteLabelDeliveryCenter'
import LoginScreen,{AdminSession} from './LoginScreen'

export default function Root(){
 const[session,setSession]=useState<AdminSession|null>(()=>{try{return JSON.parse(sessionStorage.getItem('fastlink_admin_session')||'null')}catch{return null}})
 const[testMode,setTestMode]=useState(false)
 const[appsOpen,setAppsOpen]=useState(false)
 const[treasuryOpen,setTreasuryOpen]=useState(false)
 const[walletBusinessOpen,setWalletBusinessOpen]=useState(false)
 const[tenantOpen,setTenantOpen]=useState<string|null>(null)
 const[whiteLabelOpen,setWhiteLabelOpen]=useState<string|null>(null)
 const[toast,setToast]=useState('')
 const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),2200)}
 const login=(next:AdminSession)=>{sessionStorage.setItem('fastlink_admin_session',JSON.stringify(next));setSession(next)}
 const logout=()=>{sessionStorage.removeItem('fastlink_admin_session');setSession(null);setTestMode(false)}
 if(!session)return <LoginScreen onLogin={login}/>
 if(testMode)return <SimulationCenter onBack={()=>setTestMode(false)}/>
 return <div className="root-wrap"><App role={session.role} onLogout={logout} onOpenTenant={setTenantOpen} onOpenWhiteLabel={setWhiteLabelOpen} onOpenSubsystem={()=>setAppsOpen(true)} onOpenTreasury={()=>setWalletBusinessOpen(true)}/><button className="test-lab-fab" onClick={()=>setTestMode(true)}><FlaskConical/>角色与场景测试</button>{appsOpen&&<div className="apps-overlay"><div className="apps-window"><div className="apps-window-head"><div><b>FastLink 子系统功能应用</b><span>模拟数据 · 可操作业务页面</span></div><button onClick={()=>setAppsOpen(false)}><X/></button></div><div className="apps-window-body"><SubsystemApplications notify={notify}/></div></div></div>}{walletBusinessOpen&&<WalletBusinessCenter onClose={()=>setWalletBusinessOpen(false)} onOpenLegacy={()=>{setWalletBusinessOpen(false);setTreasuryOpen(true)}} notify={notify}/>} {treasuryOpen&&<TreasuryOperationsCenter onClose={()=>setTreasuryOpen(false)} notify={notify}/>} {tenantOpen&&<TenantOperationsCenter tenantId={tenantOpen} onClose={()=>setTenantOpen(null)} notify={notify}/>} {whiteLabelOpen&&<WhiteLabelDeliveryCenter projectId={whiteLabelOpen} onClose={()=>setWhiteLabelOpen(null)} notify={notify}/>} {toast&&<div className="toast">{toast}</div>}</div>
}
