import { useEffect } from 'react'
import ProductionConsole from './ProductionConsole'
import { runtimeConfig } from './runtimeConfig'

export default function Root(){
 useEffect(()=>{
  const lockRuntimeControls=()=>{
   const apiInput=document.querySelector<HTMLInputElement>('.connection-panel form label:first-child input')
   if(apiInput){apiInput.value=runtimeConfig.apiUrl;apiInput.readOnly=true;apiInput.setAttribute('aria-readonly','true')}
   document.querySelectorAll<HTMLButtonElement>('.source-control button').forEach(button=>{
    const matches=button.textContent?.trim()===runtimeConfig.environment
    button.disabled=!matches
    if(matches&&!button.classList.contains('active'))button.click()
   })
  }
  lockRuntimeControls();const observer=new MutationObserver(lockRuntimeControls);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()
 },[])
 return <ProductionConsole/>
}
