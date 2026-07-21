import {Component,type ErrorInfo,type ReactNode} from 'react'

type Props={children:ReactNode}
type State={failed:boolean}

export default class ErrorBoundary extends Component<Props,State>{
 state:State={failed:false}

 static getDerivedStateFromError():State{return{failed:true}}

 componentDidCatch(error:Error,info:ErrorInfo){
  console.error('FastLink Admin render failure',error,info.componentStack)
 }

 render(){
  if(this.state.failed)return <main className="app-recovery" role="alert"><section><span>FASTLINK ADMIN</span><h1>页面数据加载异常</h1><p>后台仍在运行，本次结果数据未能正常显示。请返回控制台后重新查询；Admin Key 仍只保存在当前浏览器会话。</p><button type="button" onClick={()=>window.location.reload()}>返回管理后台</button></section></main>
  return this.props.children
 }
}
