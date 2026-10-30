import vm from 'node:vm'
import {webcrypto} from 'node:crypto'
export async function mountGeneratedEntry(code,runtime) {
 const timers=new Set(),requests=[],errors=[]
 let document
 class Node {
  constructor(type,name,text=''){this.nodeType=type;this.nodeName=name;this.tagName=type===1?name.toUpperCase():undefined;this.ownerDocument=document;this.childNodes=[];this.parentNode=null;this._text=text;this.attributes={};this.style={setProperty(){},removeProperty(){}};this.namespaceURI='http://www.w3.org/1999/xhtml'}
  appendChild(node){if(node.parentNode)node.parentNode.removeChild(node);this.childNodes.push(node);node.parentNode=this;return node}
  removeChild(node){const i=this.childNodes.indexOf(node);if(i<0)throw Error('missing child');this.childNodes.splice(i,1);node.parentNode=null;return node}
  insertBefore(node,next){if(!next)return this.appendChild(node);if(node.parentNode)node.parentNode.removeChild(node);const i=this.childNodes.indexOf(next);if(i<0)throw Error('missing sibling');this.childNodes.splice(i,0,node);node.parentNode=this;return node}
  get firstChild(){return this.childNodes[0]||null} get lastChild(){return this.childNodes.at(-1)||null}
  get nextSibling(){if(!this.parentNode)return null;return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null}
  get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('')}
  set textContent(value){this.childNodes=[];this._text=String(value)}
  setAttribute(key,value){this.attributes[key]=String(value);if(key==='id')this.id=String(value);if(key==='type')this.type=String(value)}
  getAttribute(key){return this.attributes[key]??null} removeAttribute(key){delete this.attributes[key]}
  hasAttribute(key){return Object.hasOwn(this.attributes,key)}
  setAttributeNS(ns,key,value){this.setAttribute(key,value)} removeAttributeNS(ns,key){this.removeAttribute(key)}
  addEventListener(){} removeEventListener(){} focus(){document.activeElement=this}
  contains(node){return node===this||this.childNodes.some(n=>n.contains(node))}
  getRootNode(){return document}
  querySelectorAll(){return []}
 }
 document=new Node(9,'#document');document.ownerDocument=document
 document.createElement=name=>{const n=new Node(1,name);if(name==='link')n.relList={supports:()=>true};return n}
 document.createElementNS=(ns,name)=>{const n=document.createElement(name);n.namespaceURI=ns;return n}
 document.createTextNode=text=>new Node(3,'#text',String(text))
 document.createComment=text=>new Node(8,'#comment',String(text))
 document.createEvent=()=>({initEvent(){},initCustomEvent(){}})
 document.documentElement=document.appendChild(document.createElement('html'))
 document.body=document.documentElement.appendChild(document.createElement('body'));document.activeElement=document.body
 const root=document.body.appendChild(document.createElement('div'));root.setAttribute('id','root')
 const visit=node=>[node,...node.childNodes.flatMap(visit)]
 document.getElementById=id=>visit(document).find(n=>n.id===id)||null
 document.querySelectorAll=()=>[]
 const later=(fn,ms=0)=>{const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.add(id);id.unref?.();return id}
 const clear=id=>{clearTimeout(id);timers.delete(id)}
 const storage={getItem:()=>null,setItem(){throw Error('unexpected storage write')},removeItem(){}}
 const window={document,__FASTLINK_RUNTIME__:runtime,location:{origin:'https://offline.fastlink.invalid',pathname:'/',search:'',hash:''},
  addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}),
  innerWidth:1200,innerHeight:800,devicePixelRatio:1,setTimeout:later,clearTimeout:clear,
  setInterval:()=>0,clearInterval(){},requestAnimationFrame:fn=>later(fn),cancelAnimationFrame:clear,
  localStorage:storage,sessionStorage:storage,Node,HTMLElement:Node,SVGElement:Node,HTMLIFrameElement:class {},HTMLInputElement:Node,
  crypto:webcrypto,navigator:{userAgent:'Offline DOM fixture'},getComputedStyle:()=>({getPropertyValue:()=>''}),history:{replaceState(){},pushState(){}}}
 window.window=window;window.self=window;document.defaultView=window
 const fetchStub=async(url,init={})=>{
  const parsed=new URL(String(url),window.location.origin)
  if(parsed.origin!==window.location.origin||!['/api/health','/api/health/readiness','/api/admin/auth/me'].includes(parsed.pathname)||
    (init.method&&init.method!=='GET'))throw Error('unexpected offline request')
  requests.push({path:parsed.pathname,method:init.method||'GET',credentials:init.credentials})
  const auth=parsed.pathname.endsWith('/auth/me')
  return new Response(JSON.stringify(auth?{message:'Synthetic unauthenticated'}:{status:'ok',service:'offline-fixture',environment:'TEST',release:runtime.buildSha,checks:{process:'ok'}}),
    {status:auth?401:200,headers:{'Content-Type':'application/json'}})
 }
 const context=vm.createContext({window,self:window,document,navigator:window.navigator,location:window.location,
  Node,HTMLElement:Node,HTMLIFrameElement:window.HTMLIFrameElement,localStorage:storage,sessionStorage:storage,
  console:{log(){},info(){},warn(){},error:(...args)=>errors.push(args.map(String).join(' '))},crypto:webcrypto,
  fetch:fetchStub,Response,Request,Headers,URL,URLSearchParams,AbortController,DOMException,TextDecoder,TextEncoder,
  setTimeout:later,clearTimeout:clear,setInterval:()=>0,clearInterval(){},setImmediate,clearImmediate,performance,
  requestAnimationFrame:window.requestAnimationFrame,cancelAnimationFrame:clear})
 try {
  new vm.Script(code,{filename:'actual-generated-admin-entry.js'}).runInContext(context,{timeout:5000})
  await new Promise(resolve=>setTimeout(resolve,80))
  const nodes=visit(root)
  return {text:root.textContent,nodes:nodes.map(n=>({tag:n.tagName||n.nodeName,attributes:n.attributes,type:n.type})),
    requests,errors,mountedChildren:root.childNodes.length,network:'SYNTHETIC_FETCH_ONLY'}
 }finally{for(const id of timers)clearTimeout(id)}
}
