import {useState} from 'react'
import {FlaskConical} from 'lucide-react'
import App from './App'
import SimulationCenter from './SimulationCenter'

export default function Root(){const[testMode,setTestMode]=useState(false);if(testMode)return <SimulationCenter onBack={()=>setTestMode(false)}/>;return <div className="root-wrap"><App/><button className="test-lab-fab" onClick={()=>setTestMode(true)}><FlaskConical/>角色与场景测试</button></div>}
