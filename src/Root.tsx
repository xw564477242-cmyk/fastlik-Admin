import {useEffect,useState} from 'react'
import {FlaskConical,X} from 'lucide-react'
import App from './App'
import SimulationCenter from './SimulationCenter'
import SubsystemApplications from './SubsystemApplications'
import TreasuryOperationsCenter from './TreasuryOperationsCenter'

export default function Root(){
 const[testMode,setTestMode]=useState(false)
 const[appsOpen,setAppsOpen]=useState(false)
 const[treasuryOpen,setTreasuryOpen]=useState(false)
 const[toast,setToast]=useState('')
 useEffect(()=>{
  const onClick=(e:MouseEvent)=>{
   const el=(e.target as HTMLElement).closest('button')
   const text=el?.textContent?.trim()||''
   if(text==='进入子系统')setAppsOpen(true)
   if(text.includes('资金池与清算'))setTreasuryOpen(true)
  }
  document.addEventListener('click',onClick);return()=>document.removeEventListener('click',onClick)
 },[])
 const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),2200)}
 if(testMode)return <SimulationCenter onBack={()=>setTestMode(false)}/>
 return <div className="root-wrap"><App/><button className="test-lab-fab" onClick={()=>setTestMode(true)}><FlaskConical/>角色与场景测试</button>{appsOpen&&<div className="apps-overlay"><div className="apps-window"><div className="apps-window-head"><div><b>FastLink 子系统功能应用</b><span>模拟数据 · 可操作业务页面</span></div><button onClick={()=>setAppsOpen(false)}><X/></button></div><div className="apps-window-body"><SubsystemApplications notify={notify}/></div></div></div>}{treasuryOpen&&<TreasuryOperationsCenter onClose={()=>setTreasuryOpen(false)} notify={notify}/>} {toast&&<div className="toast">{toast}</div>}</div>
}
