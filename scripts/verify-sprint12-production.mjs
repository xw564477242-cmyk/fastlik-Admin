import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')
const sourceFiles = readdirSync(join(root, 'src')).filter((name) => /\.(ts|tsx)$/.test(name))
const source = sourceFiles.map((name) => read(`src/${name}`)).join('\n')
const app = read('src/AdminApp.tsx')
const api = read('src/productionApi.ts')
const runtime = read('src/runtimeConfig.ts')
const main = read('src/main.tsx')

const required = [
  ['original full navigation', ['平台总览', '租户与合作方', '白标 / OEM / ODM', '卡项目管理', 'Card Center', 'Card History', '子系统中心', '资金池与清算', '业务运营看板', 'Merchant / Testing', '费率与收入分成', 'Developer Sandbox', 'API 与 Webhook', '终端用户运营', '风控与合规', 'Role Management', '系统设置与审计'].every((label) => app.includes(label))],
  ['immutable API build variable', runtime.includes("required('VITE_FASTLINK_API_URL')")],
  ['immutable environment build variable', runtime.includes("required('VITE_FASTLINK_ENVIRONMENT')")],
  ['real Admin login', api.includes('/admin/auth/login')],
  ['real Admin logout', api.includes('/admin/auth/logout')],
  ['Bearer authorization', api.includes('Authorization:`Bearer ${token}`')],
  ['tenant API', api.includes("'/admin/tenants'")],
  ['wallet API', api.includes('/wallet/operations')],
  ['ledger API', api.includes('/ledger/journals')],
  ['treasury API', api.includes('/dashboards/treasury')],
  ['settlement API', api.includes('/settlement/reconciliation')],
  ['risk API', api.includes('/dashboards/risk')],
  ['merchant API', api.includes('/merchant/payments')],
  ['card lifecycle API', api.includes('/freeze') && api.includes('/unfreeze')],
  ['Trace endpoint', api.includes('/operations/traces/')],
  ['Evidence Center endpoint', api.includes('/evidence/summary')],
  ['new full Admin entrypoint', main.includes("'./admin-app.css'")],
  ['unavailable truth boundary', app.includes('Backend Contract Missing')],
]

const forbidden = [
  ['hard-coded fake email', /admin@fastlink\.test/i],
  ['hard-coded fake password', /FastLink2026!/],
  ['browser secret persistence', /(localStorage|sessionStorage)/],
  ['legacy seed collections', /(seedTenants|seedPrograms|initialRoles|sprint06DemoData)/i],
  ['demo data generator', /(generateSprint|demoData|mockApi|mockDashboard)/i],
  ['legacy platform Admin Key', /(ADMIN_API_KEY|x-admin-api-key)/i],
  ['obsolete readiness-only root', /<ProductionConsole\s*\/>/],
]

for (const [label, ok] of required) if (!ok) throw new Error(`Missing ${label}`)
for (const [label, pattern] of forbidden) if (pattern.test(source)) throw new Error(`Forbidden ${label}`)
console.log(`FastLink full Admin real-API verification PASS (${required.length} requirements, ${forbidden.length} contamination checks)`)
