import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const root=dirname(dirname(fileURLToPath(import.meta.url)))
const outputDir=mkdtempSync(join(tmpdir(),'fastlink-s07-'))
const esbuild=join(root,'node_modules','.bin','esbuild')
const bundle=source=>{const output=join(outputDir,`${source}.mjs`);execFileSync(esbuild,[join(root,'src',`${source}.ts`),'--bundle','--platform=node','--format=esm',`--outfile=${output}`],{stdio:'pipe'});return import(pathToFileURL(output).href)}

const {createSprint07DemoData}=await bundle('sprint07DemoData')
const {MockRoleManagementAdapter,permissions}=await bundle('roleManagementAdapter')
const first=createSprint07DemoData();const second=createSprint07DemoData()
assert.equal(first.merchants.length,100,'must create 100 merchants')
assert.equal(first.cards.length,500,'must create 500 cards')
assert.equal(first.wallets.length,1000,'must create 1,000 wallets')
assert.equal(first.transactions.length,10000,'must create 10,000 transactions')
assert.equal(first.cardHistory.length,2500,'must create accessible card history')
assert.deepEqual(new Set(first.wallets.map(row=>row.currency)),new Set(['USD','EUR','GBP','MYR','SGD','USDT']))
assert.deepEqual(new Set(first.cards.map(row=>row.type)),new Set(['VIRTUAL','PHYSICAL']))
assert.ok(first.transactions.every(row=>first.cards.some(card=>card.id===row.cardId)))
assert.deepEqual(second.transactions[9999],first.transactions[9999],'demo data must be deterministic')

const adapter=new MockRoleManagementAdapter()
const roles=(await adapter.listRoles()).data
assert.equal(roles.length,6)
assert.equal(roles.find(role=>role.name==='Platform Super Admin').permissionIds.length,permissions.length)
const created=(await adapter.createRole({name:'Test Operator',scope:'TENANT'})).data
assert.equal(created.permissionIds.length,1,'new roles must be least-privilege')
const updated=(await adapter.updateRole({...created,status:'DISABLED'})).data
assert.equal(updated.status,'DISABLED')

console.log('Sprint-07 verification passed: Role Adapter · 100 merchants · 500 cards · 1,000 wallets · 10,000 transactions · Card History')
