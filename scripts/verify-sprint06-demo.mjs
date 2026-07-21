import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const root=dirname(dirname(fileURLToPath(import.meta.url)))
const output=join(mkdtempSync(join(tmpdir(),'fastlink-s06-')),'demo.mjs')
execFileSync(join(root,'node_modules','.bin','esbuild'),[join(root,'src','sprint06DemoData.ts'),'--bundle','--platform=node','--format=esm',`--outfile=${output}`],{stdio:'pipe'})
const {createSprint06DemoData,csvText}=await import(pathToFileURL(output).href)
const first=createSprint06DemoData()
const second=createSprint06DemoData()

assert.equal(first.users.length,1000,'must create 1,000 users')
assert.equal(first.transactions.length,10000,'must create 10,000 transactions')
assert.equal(first.cards.length,100,'must create 100 cards')
assert.deepEqual(new Set(first.users.map(row=>row.currency)),new Set(['USD','EUR','GBP','MYR','SGD','USDT']))
assert.deepEqual(new Set(first.cards.map(row=>row.type)),new Set(['VIRTUAL','PHYSICAL']))
assert.deepEqual(second.transactions[9999],first.transactions[9999],'demo data must be deterministic')
assert.ok(first.settlements.some(row=>row.status==='PENDING'))
assert.ok(first.settlements.some(row=>row.status==='FAILED'))
assert.ok(first.transactions.some(row=>row.status==='DECLINED'))
assert.ok(first.webhooks.some(row=>row.status==='RETRYING'))
assert.ok(first.webhooks.some(row=>row.status==='FAILED'))
const csv=csvText([{id:'TX-1',merchant:'=HYPERLINK("unsafe")',amount:10}])
assert.ok(csv.includes("'=HYPERLINK"),'CSV formulas must be neutralized')
assert.ok(!csv.includes(',=HYPERLINK'))

console.log('Sprint-06 demo verification passed: 1,000 users · 10,000 transactions · 100 cards · multi-currency · CSV safety')
