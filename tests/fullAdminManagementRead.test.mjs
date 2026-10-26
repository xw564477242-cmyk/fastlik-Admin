import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{create,act}=require('react-test-renderer')
const src=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src')
class ApiError extends Error {constructor(status){super('test read error');this.status=status;this.traceId='mock-trace-1234'}}
function load(file,api,cache=new Map()) {
  const full=path.join(src,file);if(cache.has(full))return cache.get(full)
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const module={exports:{}};cache.set(full,module.exports)
  const local=name=>name==='./productionApi'?{productionApi:api,DEFAULT_API:'/api',ApiError}:name==='./runtimeConfig'?{runtimeConfig:{previewReadOnly:true}}:name.startsWith('.')?load(path.join(path.dirname(file),name)+(path.extname(name)?'':fs.existsSync(path.join(src,path.dirname(file),name+'.tsx'))?'.tsx':'.ts'),api,cache):require(name)
  vm.runInThisContext('(function(exports,require){'+code+'\n})')(module.exports,local);return module.exports
}
const session={accessToken:'MOCK_ONLY_NOT_A_CREDENTIAL',expiresAt:'2099-01-01T00:00:00Z',user:{id:'admin_A',tenantId:'tenant_A',environment:'TEST',permissions:['admin:read','support:cases:read']}}
const props={session,tenantId:'tenant_A',onUnauthorized:()=>assert.fail('unexpected unauthorized')}
const btn=(r,label)=>r.root.findAllByType('button').find(b=>b.props.children===label)
const text=r=>JSON.stringify(r.toJSON())
const user=i=>({userId:'user_'+i,tenantId:'tenant_A',environment:'TEST',kycStatus:'APPROVED',createdAt:'2026-10-17T00:00:00Z'})

test('user management task: server page → fresh detail → exact KYC association; no PII or write permission',async()=>{
 const calls=[],selected=[];const api={adminUsers:async(_b,_t,tenant,env,q)=>{calls.push({kind:'list',tenant,env,...q});return {data:Array.from({length:q.offset===0?25:1},(_,i)=>user(q.offset+i)),total:26,limit:q.limit,offset:q.offset}},adminUserDirectoryDetail:async(_b,_t,tenant,env,id)=>{calls.push({kind:'detail',tenant,env,id});return user(25)}}
 const {FullAdminReadWorkspace,parseAdminUserRecord}=load('FullAdminReadWorkspace.tsx',api);let r
 await act(async()=>{r=create(React.createElement(FullAdminReadWorkspace,{...props,page:'users',onSelectUser:id=>selected.push(id)}))})
 assert.equal(calls[0].offset,0);await act(async()=>btn(r,'下一页').props.onClick());assert.equal(calls[1].offset,25)
 await act(async()=>btn(r,'查看').props.onClick());assert.equal(calls[2].id,'user_25')
 await act(async()=>btn(r,'查看此用户 KYC').props.onClick());assert.deepEqual(selected,['user_25'])
 assert.equal(r.root.findByType('fieldset').props.disabled,true)
 for(const bad of [{...user(1),tenantId:'tenant_B'},{...user(1),email:'unexpected@synthetic.invalid'},{...user(1),userId:'../bad'}])assert.throws(()=>parseAdminUserRecord(bad,'tenant_A','TEST'))
 await act(async()=>r.unmount())
})

test('events task uses backend total beyond 200, next page, fresh detail and Trace association',async()=>{
 const calls=[],traces=[];const event=i=>({id:'event_'+i,eventType:'DISPLAY_ONLY',status:'PENDING',traceId:'trace-event-'+i})
 const api={apiClients:async()=>({data:[],total:0,limit:25,offset:0}),events:async(_b,_t,tenant,env,q)=>{calls.push({kind:'list',tenant,env,...q});return {data:Array.from({length:25},(_,i)=>event(q.offset+i)),total:230,limit:q.limit,offset:q.offset}},event:async(_b,_t,tenant,env,id)=>{calls.push({kind:'detail',id,tenant,env});return event(25)}}
 const {FullAdminReadWorkspace}=load('FullAdminReadWorkspace.tsx',api);let r
 await act(async()=>{r=create(React.createElement(FullAdminReadWorkspace,{...props,page:'api',onSelectTrace:id=>traces.push(id)}))})
 const eventsTab=r.root.findAllByType('button').find(b=>b.props['aria-pressed']===false)
 await act(async()=>eventsTab.props.onClick());assert.equal(calls[0].offset,0);assert(text(r).includes('230'))
 await act(async()=>btn(r,'下一页').props.onClick());assert.equal(calls[1].offset,25)
 await act(async()=>btn(r,'查看').props.onClick());assert.equal(calls[2].kind,'detail');assert.equal(calls[2].id,'event_25')
 await act(async()=>btn(r,'查询关联 Trace').props.onClick());assert.deepEqual(traces,['trace-event-25'])
 await act(async()=>r.unmount())
})

test('filter/token scope drops stale detail and late old response; wrong tenant receives no request',async()=>{
 let resolveOld;const calls=[];const api={adminUsers:async(_b,token,_tenant,_env,q)=>{calls.push(token);return token==='OLD_MOCK_TOKEN'?new Promise(resolve=>resolveOld=resolve):{data:[],total:0,limit:q.limit,offset:q.offset}}}
 const {FullAdminReadWorkspace}=load('FullAdminReadWorkspace.tsx',api);let r
 await act(async()=>{r=create(React.createElement(FullAdminReadWorkspace,{...props,page:'users',session:{...session,accessToken:'OLD_MOCK_TOKEN'}}))})
 await act(async()=>r.update(React.createElement(FullAdminReadWorkspace,{...props,page:'users'})))
 await act(async()=>resolveOld({data:[user(99)],total:1,limit:25,offset:0}));assert(!text(r).includes('user_99'))
 const count=calls.length;await act(async()=>r.update(React.createElement(FullAdminReadWorkspace,{...props,page:'users',tenantId:'tenant_B'})));assert.equal(calls.length,count)
 await act(async()=>r.unmount())
})

test('support task distinguishes not queried from true empty, reads linked audit, never permits writes',async()=>{
 const calls=[];const api={supportCases:async(_b,_t,tenant,trace)=>{calls.push({kind:'cases',tenant,trace});return {records:[],truncated:false}},cardSupportAudit:async(_b,_t,tenant,trace)=>{calls.push({kind:'audit',tenant,trace});return JSON.stringify({version:1,tenantId:tenant,environment:'TEST',traceId:trace,status:'NO_RECORDS',truncated:false,records:[]})}}
 const {SupportReadWorkspace}=load('SupportReadWorkspace.tsx',api);let r
 await act(async()=>{r=create(React.createElement(SupportReadWorkspace,{session,tenantId:'tenant_A',invalidateSession:()=>assert.fail('unexpected invalidate')}))})
 assert(!text(r).includes('服务端返回零条匹配工单'));assert.equal(btn(r,'查询客服工单').props.disabled,true)
 await act(async()=>r.root.findByType('input').props.onChange({target:{value:'trace-synthetic-A'}}))
 await act(async()=>btn(r,'查询客服工单').props.onClick());assert(text(r).includes('服务端返回零条匹配工单'));assert.equal(btn(r,'创建客服工单').props.disabled,true)
 await act(async()=>btn(r,'读取关联查询审计').props.onClick());assert.equal(calls[1].kind,'audit');assert.equal(calls[1].trace,'trace-synthetic-A')
 assert(text(r).includes('服务端返回零条匹配审计'));assert.equal(calls.length,2)
 await act(async()=>r.unmount())
})

test('merchant task follows server-filtered payment history and re-reads its related merchant',async()=>{
 const calls=[];const api={merchants:async()=>({data:[{id:'merchant_A',name:'Synthetic merchant'}],total:1,limit:25,offset:0}),merchantDetail:async(_b,_t,tenant,env,id)=>{calls.push({kind:'merchant',tenant,env,id});return {id,name:'Synthetic merchant',payments:[],qrCodes:[]}},merchantPayments:async(_b,_t,tenant,env,q)=>{calls.push({kind:'payments',tenant,env,...q});return {data:[{id:'payment_A',merchantId:'merchant_A',status:'FAILED'}],total:1,limit:q.limit,offset:q.offset}},merchantPaymentDetail:async(_b,_t,tenant,env,id)=>{calls.push({kind:'payment',tenant,env,id});return {id,merchantId:'merchant_A',status:'FAILED'}}}
 const {FullAdminReadWorkspace}=load('FullAdminReadWorkspace.tsx',api);let r
 await act(async()=>{r=create(React.createElement(FullAdminReadWorkspace,{...props,page:'merchanttesting'}))})
 await act(async()=>btn(r,'查看').props.onClick());await act(async()=>btn(r,'查看该商户支付历史').props.onClick());assert.equal(calls[1].merchantId,'merchant_A')
 await act(async()=>btn(r,'查看').props.onClick());assert.equal(calls[2].id,'payment_A');await act(async()=>btn(r,'读取所属商户').props.onClick());assert.deepEqual(calls[3],{kind:'merchant',tenant:'tenant_A',env:'TEST',id:'merchant_A'})
 await act(async()=>r.unmount())
})

test('support positive record detail is fetched again and validated against exact trace/tenant',async()=>{
 const row={version:1,id:'case_A',tenantId:'tenant_A',environment:'TEST',traceId:'trace-positive-A',reason:'STATUS_QUESTION',status:'OPEN',createdBy:'admin_A',assignedTo:'admin_A',resolution:null,createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',closedAt:null},calls=[]
 const api={supportCases:async()=>({records:[row],truncated:false}),supportCase:async(_b,_t,tenant,id)=>{calls.push({tenant,id});return row}}
 const {SupportReadWorkspace}=load('SupportReadWorkspace.tsx',api);let r
 await act(async()=>{r=create(React.createElement(SupportReadWorkspace,{session,tenantId:'tenant_A',invalidateSession:()=>assert.fail()}))})
 await act(async()=>r.root.findByType('input').props.onChange({target:{value:'trace-positive-A'}}));await act(async()=>btn(r,'查询客服工单').props.onClick());await act(async()=>btn(r,'重新读取工单详情').props.onClick());assert.deepEqual(calls,[{tenant:'tenant_A',id:'case_A'}]);assert(text(r).includes('STATUS_QUESTION'));assert.equal(btn(r,'接手处置').props.disabled,true)
 await act(async()=>r.unmount())
})
