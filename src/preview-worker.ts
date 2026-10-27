import { previewAccess, previewProxy, type PreviewEnv } from './preview-gateway'
type Env=PreviewEnv&{ASSETS:{fetch:(request:Request)=>Promise<Response>}}
export default {
 async fetch(request:Request,env:Env) {
  try{
   const binding=await previewAccess(request,env),url=new URL(request.url)
   if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return previewProxy(request,binding)
   if(url.pathname==='/runtime-config.js')return new Response('window.__FASTLINK_RUNTIME__ = Object.freeze('+JSON.stringify({environment:'TEST',apiUrl:'/api',buildSha:binding.buildSha})+');',{headers:{'content-type':'application/javascript','cache-control':'no-store'}})
   if(url.pathname==='/healthz')return Response.json({status:'liveness',candidateId:binding.candidate,sourceCommit:binding.buildSha,sourceSnapshot:binding.snapshot,deploymentId:null,Gate1:'NOT_PASSED',wholeProjectReady:false})
   return await env.ASSETS.fetch(request)
  }catch{return new Response('Preview unavailable',{status:503,headers:{'cache-control':'no-store'}})}
 }
}
