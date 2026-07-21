import {DEFAULT_API} from './treasuryApi'

export type RoleStatus='ACTIVE'|'DISABLED'
export type RoleScope='PLATFORM'|'TENANT'|'TREASURY'|'COMPLIANCE'|'SANDBOX'|'READ_ONLY'
export type Permission={id:string;module:string;action:string;risk:'LOW'|'MEDIUM'|'HIGH';description:string}
export type ManagedRole={id:string;name:string;scope:RoleScope;members:number;status:RoleStatus;permissionIds:string[];system:boolean;updatedAt:string}
export type AdapterSource='MOCK'|'BACKEND'|'MOCK_FALLBACK'
export type AdapterResult<T>={data:T;source:AdapterSource;notice?:string}

export interface RoleManagementAdapter{
 listRoles():Promise<AdapterResult<ManagedRole[]>>
 listPermissions():Promise<AdapterResult<Permission[]>>
 createRole(input:Pick<ManagedRole,'name'|'scope'>):Promise<AdapterResult<ManagedRole>>
 updateRole(role:ManagedRole):Promise<AdapterResult<ManagedRole>>
}

export const permissions:Permission[]=[
 {id:'tenant.read',module:'Tenants',action:'READ',risk:'LOW',description:'查看租户与组织'},
 {id:'tenant.manage',module:'Tenants',action:'MANAGE',risk:'HIGH',description:'创建、停用租户'},
 {id:'wallet.read',module:'Wallet',action:'READ',risk:'LOW',description:'查看钱包及历史'},
 {id:'wallet.operate',module:'Wallet',action:'OPERATE',risk:'HIGH',description:'充值、提现、内部转账'},
 {id:'card.read',module:'Cards',action:'READ',risk:'LOW',description:'查看卡片与 Card History'},
 {id:'card.manage',module:'Cards',action:'MANAGE',risk:'HIGH',description:'发卡、冻结、PIN 操作'},
 {id:'treasury.read',module:'Treasury',action:'READ',risk:'LOW',description:'查看资金池与 Trial Balance'},
 {id:'treasury.operate',module:'Treasury',action:'OPERATE',risk:'HIGH',description:'资金调拨与清算'},
 {id:'risk.manage',module:'Risk',action:'MANAGE',risk:'HIGH',description:'风险案件和规则'},
 {id:'merchant.manage',module:'Merchants',action:'MANAGE',risk:'MEDIUM',description:'商户与测试数据管理'},
 {id:'webhook.replay',module:'Webhooks',action:'REPLAY',risk:'MEDIUM',description:'Webhook 回放'},
 {id:'audit.export',module:'Audit',action:'EXPORT',risk:'MEDIUM',description:'审计与 CSV 导出'},
]

const all=permissions.map(value=>value.id)
const now='2026-07-21T08:00:00.000Z'
const initialRoles:ManagedRole[]=[
 {id:'ROLE-001',name:'Platform Super Admin',scope:'PLATFORM',members:2,status:'ACTIVE',permissionIds:all,system:true,updatedAt:now},
 {id:'ROLE-002',name:'Tenant Administrator',scope:'TENANT',members:8,status:'ACTIVE',permissionIds:['tenant.read','wallet.read','wallet.operate','card.read','card.manage','merchant.manage','audit.export'],system:true,updatedAt:now},
 {id:'ROLE-003',name:'Treasury Operator',scope:'TREASURY',members:3,status:'ACTIVE',permissionIds:['wallet.read','treasury.read','treasury.operate','audit.export'],system:true,updatedAt:now},
 {id:'ROLE-004',name:'Compliance Officer',scope:'COMPLIANCE',members:4,status:'ACTIVE',permissionIds:['tenant.read','wallet.read','card.read','risk.manage','audit.export'],system:true,updatedAt:now},
 {id:'ROLE-005',name:'Developer',scope:'SANDBOX',members:11,status:'ACTIVE',permissionIds:['tenant.read','wallet.read','card.read','card.manage','merchant.manage','webhook.replay'],system:true,updatedAt:now},
 {id:'ROLE-006',name:'Read Only Auditor',scope:'READ_ONLY',members:2,status:'DISABLED',permissionIds:['tenant.read','wallet.read','card.read','treasury.read','audit.export'],system:true,updatedAt:now},
]

export class MockRoleManagementAdapter implements RoleManagementAdapter{
 private roles=structuredClone(initialRoles)
 async listRoles(){return {data:structuredClone(this.roles),source:'MOCK' as const}}
 async listPermissions(){return {data:structuredClone(permissions),source:'MOCK' as const}}
 async createRole(input:Pick<ManagedRole,'name'|'scope'>){const role:ManagedRole={id:`ROLE-${String(this.roles.length+1).padStart(3,'0')}`,name:input.name,scope:input.scope,members:0,status:'ACTIVE',permissionIds:['tenant.read'],system:false,updatedAt:new Date().toISOString()};this.roles.push(role);return {data:structuredClone(role),source:'MOCK' as const}}
 async updateRole(role:ManagedRole){this.roles=this.roles.map(value=>value.id===role.id?structuredClone(role):value);return {data:structuredClone(role),source:'MOCK' as const}}
}

class BackendRoleManagementAdapter implements RoleManagementAdapter{
 constructor(private readonly apiKey:string){}
 private async request<T>(path:string,init?:RequestInit){const response=await fetch(`${DEFAULT_API}${path}`,{...init,mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json','x-admin-api-key':this.apiKey,...(init?.headers||{})}});if(!response.ok)throw new Error(`RBAC API ${response.status}`);return response.json() as Promise<T>}
 async listRoles(){return {data:await this.request<ManagedRole[]>('/admin/rbac/roles'),source:'BACKEND' as const}}
 async listPermissions(){return {data:await this.request<Permission[]>('/admin/rbac/permissions'),source:'BACKEND' as const}}
 async createRole(input:Pick<ManagedRole,'name'|'scope'>){return {data:await this.request<ManagedRole>('/admin/rbac/roles',{method:'POST',body:JSON.stringify(input)}),source:'BACKEND' as const}}
 async updateRole(role:ManagedRole){return {data:await this.request<ManagedRole>(`/admin/rbac/roles/${role.id}`,{method:'PATCH',body:JSON.stringify(role)}),source:'BACKEND' as const}}
}

class ResilientRoleManagementAdapter implements RoleManagementAdapter{
 private readonly backend:BackendRoleManagementAdapter
 constructor(apiKey:string,private readonly mock:MockRoleManagementAdapter){this.backend=new BackendRoleManagementAdapter(apiKey)}
 private fallback<T>(data:T){return {data,source:'MOCK_FALLBACK' as const,notice:'Backend RBAC endpoint 尚未启用，已安全切换至 Mock Adapter；现有前端 RBAC 继续生效。'}}
 async listRoles(){try{return await this.backend.listRoles()}catch{return this.fallback((await this.mock.listRoles()).data)}}
 async listPermissions(){try{return await this.backend.listPermissions()}catch{return this.fallback((await this.mock.listPermissions()).data)}}
 async createRole(input:Pick<ManagedRole,'name'|'scope'>){try{return await this.backend.createRole(input)}catch{return this.fallback((await this.mock.createRole(input)).data)}}
 async updateRole(role:ManagedRole){try{return await this.backend.updateRole(role)}catch{return this.fallback((await this.mock.updateRole(role)).data)}}
}

export function createRoleManagementAdapter(apiKey=''):RoleManagementAdapter{
 const mock=new MockRoleManagementAdapter()
 return apiKey?new ResilientRoleManagementAdapter(apiKey,mock):mock
}
