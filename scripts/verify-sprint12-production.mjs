import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'

const root=new URL('..',import.meta.url).pathname
const read=path=>readFileSync(join(root,path),'utf8')
const sourceFiles=readdirSync(join(root,'src')).filter(name=>/\.(ts|tsx)$/.test(name))
const source=sourceFiles.map(name=>read(`src/${name}`)).join('\n')
const consoleSource=read('src/ProductionConsole.tsx')
const apiSource=read('src/productionApi.ts')
const main=read('src/main.tsx')

const required=[
 ['Data Source label',consoleSource.includes('Data Source:')],
 ['Sandbox source',consoleSource.includes("'SANDBOX'")],
 ['UAT source',consoleSource.includes("'UAT'")],
 ['Production source',consoleSource.includes("'PRODUCTION'")],
 ['No fallback statement',consoleSource.includes('NO MOCK FALLBACK')],
 ['Trace endpoint',apiSource.includes('/operations/traces/')],
 ['Contamination endpoint',apiSource.includes('/operations/mock-contamination')],
 ['Production stylesheet',main.includes("'./production-console.css'")],
 ['Admin user login',apiSource.includes('/admin/auth/login')],
 ['Bearer authorization',apiSource.includes('Authorization:`Bearer ${token}`')],
 ['Evidence Center endpoint',apiSource.includes('/evidence/summary')],
 ['Daily Closing endpoint',apiSource.includes('/settlement/daily-closing')],
]
const forbidden=[
 ['hard-coded fake email',/admin@fastlink\.test/i],
 ['hard-coded fake password',/FastLink2026!/],
 ['browser secret persistence',/(localStorage|sessionStorage)/],
 ['deleted treasury simulation route',/treasury\/simulate/],
 ['demo data generator',/(generateSprint|demoData|mockApi|mockDashboard)/i],
 ['legacy platform Admin Key',/(ADMIN_API_KEY|x-admin-api-key)/i],
]

for(const[label,ok]of required)if(!ok)throw new Error(`Missing ${label}`)
for(const[label,pattern]of forbidden)if(pattern.test(source))throw new Error(`Forbidden ${label}`)
console.log(`Sprint-13 Phase-3 Admin verification PASS (${required.length} requirements, ${forbidden.length} contamination checks)`)
