import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Code2,
  CreditCard,
  Database,
  FileCog,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Palette,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Unplug,
  Users,
  WalletCards,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'
import { runtimeConfig } from './runtimeConfig'
import {
  ApiError,
  DEFAULT_API,
  productionApi,
  type AdminSession,
  type DataSource,
  type Tenant,
} from './productionApi'

type NavId =
  | 'overview'
  | 'tenants'
  | 'whitelabel'
  | 'programs'
  | 'cardcenter'
  | 'cardhistory'
  | 'subsystems'
  | 'funds'
  | 'dashboards'
  | 'merchanttesting'
  | 'revenue'
  | 'sandbox'
  | 'api'
  | 'operations'
  | 'risk'
  | 'permissions'
  | 'system'

type NavItem = { id: NavId; label: string; icon: LucideIcon }
type JsonRecord = Record<string, unknown>
type DataSection = { title: string; description: string; value: unknown }

const nav: NavItem[] = [
  { id: 'overview', label: '平台总览', icon: LayoutDashboard },
  { id: 'tenants', label: '租户与合作方', icon: Building2 },
  { id: 'whitelabel', label: '白标 / OEM / ODM', icon: Palette },
  { id: 'programs', label: '卡项目管理', icon: CreditCard },
  { id: 'cardcenter', label: 'Card Center', icon: WalletCards },
  { id: 'cardhistory', label: 'Card History', icon: FileCog },
  { id: 'subsystems', label: '子系统中心', icon: Boxes },
  { id: 'funds', label: '资金池与清算', icon: Landmark },
  { id: 'dashboards', label: '业务运营看板', icon: Activity },
  { id: 'merchanttesting', label: 'Merchant / Testing', icon: Building2 },
  { id: 'revenue', label: '费率与收入分成', icon: CircleDollarSign },
  { id: 'sandbox', label: 'Developer Sandbox', icon: Code2 },
  { id: 'api', label: 'API 与 Webhook', icon: Webhook },
  { id: 'operations', label: '终端用户运营', icon: Users },
  { id: 'risk', label: '风控与合规', icon: ShieldCheck },
  { id: 'permissions', label: 'Role Management', icon: LockKeyhole },
  { id: 'system', label: '系统设置与审计', icon: Settings },
]

const unavailable: Partial<Record<NavId, { title: string; detail: string }>> = {
  whitelabel: {
    title: 'Unavailable · Backend Contract Missing',
    detail: '原白标 / OEM / ODM 页面设计已保留，但 Railway Backend 当前没有白标项目、品牌配置或交付任务的正式读取接口。',
  },
  programs: {
    title: 'Unavailable · Backend Contract Missing',
    detail: 'Railway Backend 已有单卡生命周期合同，但没有可供 Admin 使用的卡项目列表读取合同；本页不会恢复旧卡项目种子数据。',
  },
  revenue: {
    title: 'Unavailable · Backend Contract Missing',
    detail: 'Railway Backend 当前没有费率模板、账单或收入分成的正式读取接口；本页不会显示历史演示收入。',
  },
}

const capabilityRows: JsonRecord[] = [
  { module: '租户与组织中心', source: 'GET /admin/tenants', state: 'CONNECTED' },
  { module: '钱包与账本', source: 'GET /wallet/* + /ledger/*', state: 'CONNECTED' },
  { module: '卡片与发卡', source: 'GET/POST /cards/*', state: 'CONNECTED' },
  { module: 'Treasury 与清算', source: 'GET /dashboards/* + /settlement/*', state: 'CONNECTED' },
  { module: '风险与合规', source: 'GET /dashboards/risk', state: 'CONNECTED' },
  { module: '商户支付', source: 'GET /merchants + /merchant/payments', state: 'CONNECTED' },
  { module: '开放平台', source: 'GET /api-clients + /events', state: 'CONNECTED' },
  { module: '白标交付', source: 'No formal read endpoint', state: 'UNAVAILABLE' },
  { module: '计费与分成', source: 'No formal read endpoint', state: 'UNAVAILABLE' },
  { module: '角色管理', source: 'Session roles/permissions only', state: 'PARTIAL' },
]

function requestedView(): NavId {
  const value = new URLSearchParams(window.location.search).get('view') as NavId | null
  return value && nav.some((item) => item.id === value) ? value : 'overview'
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : { value }
}

function rowsFrom(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord)
  if (!value || typeof value !== 'object') return value === undefined ? [] : [{ value }]
  const record = value as JsonRecord
  for (const key of ['data', 'items', 'rows', 'positions', 'operations', 'transactions', 'events', 'clients', 'artifacts']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(asRecord)
  }
  return [record]
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'YES' : 'NO'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value)
  const serialized = JSON.stringify(value)
  return serialized.length > 90 ? `${serialized.slice(0, 87)}…` : serialized
}

function errorText(value: unknown): string {
  if (value instanceof ApiError) return value.message
  return value instanceof Error ? value.message : 'Railway API request failed'
}

async function settledSection(title: string, description: string, promise: Promise<unknown>): Promise<DataSection> {
  try {
    return { title, description, value: await promise }
  } catch (error) {
    return { title, description, value: { status: 'UNAVAILABLE', error: errorText(error) } }
  }
}

export default function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [tenantInput, setTenantInput] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setLoginBusy(true)
    setLoginError('')
    try {
      await productionApi.health(DEFAULT_API)
      const next = await productionApi.login(DEFAULT_API, tenantInput.trim(), email.trim(), password)
      if (next.user.environment !== runtimeConfig.environment) {
        await productionApi.logout(DEFAULT_API, next.accessToken)
        throw new Error(`账号环境是 ${next.user.environment}，当前构建环境是 ${runtimeConfig.environment}`)
      }
      setPassword('')
      setSession(next)
    } catch (error) {
      setPassword('')
      setSession(null)
      setLoginError(errorText(error))
    } finally {
      setLoginBusy(false)
    }
  }

  const logout = async () => {
    const token = session?.accessToken
    setSession(null)
    setPassword('')
    if (token) {
      try {
        await productionApi.logout(DEFAULT_API, token)
      } catch {
        // The browser session is still destroyed when remote revocation is unavailable.
      }
    }
  }

  if (!session) {
    return (
      <main className="admin-login">
        <section className="login-brand">
          <div className="login-logo">F</div>
          <span>FASTLINK FINANCIAL SAAS</span>
          <h1>运营管理后台</h1>
          <p>正式 Railway API、真实管理员 Session 与租户级 RBAC。连接失败时不提供 Demo 或 Mock fallback。</p>
          <div className="login-source"><i />{runtimeConfig.environment} · {DEFAULT_API}</div>
        </section>
        <form className="login-card" onSubmit={login}>
          <div>
            <span>SECURE ADMIN ACCESS</span>
            <h2>管理员登录</h2>
            <p>凭证只用于本次登录请求，不写入浏览器存储。</p>
          </div>
          <label>Tenant ID / Slug<input required value={tenantInput} onChange={(event) => setTenantInput(event.target.value)} autoComplete="organization" /></label>
          <label>管理员邮箱<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
          <label>密码<div className="password-field"><KeyRound /><input required minLength={10} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></div></label>
          {loginError && <div className="inline-error"><AlertTriangle />{loginError}</div>}
          <button disabled={loginBusy}>{loginBusy ? <><LoaderCircle className="spin" />正在连接 Railway…</> : '登录正式后台'}</button>
        </form>
      </main>
    )
  }

  return <AuthenticatedAdmin session={session} onLogout={() => void logout()} />
}

function AuthenticatedAdmin({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const [active, setActive] = useState<NavId>(requestedView)
  const [mobile, setMobile] = useState(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState(session.user.tenantId)
  const [sections, setSections] = useState<DataSection[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const source = session.user.environment as DataSource
  const token = session.accessToken
  const selectedTenant = tenants.find((item) => item.id === tenantId)
  const current = nav.find((item) => item.id === active) ?? nav[0]

  useEffect(() => {
    let cancelled = false
    const loadTenants = async () => {
      try {
        const result = await productionApi.tenants(DEFAULT_API, token)
        if (!cancelled) setTenants(result)
      } catch {
        try {
          const currentTenant = await productionApi.tenant(DEFAULT_API, token, session.user.tenantId)
          if (!cancelled) setTenants([currentTenant])
        } catch (error) {
          if (!cancelled) setError(errorText(error))
        }
      }
    }
    void loadTenants()
    return () => { cancelled = true }
  }, [session.user.tenantId, token])

  const load = useCallback(async () => {
    if (!tenantId || unavailable[active] || ['cardcenter', 'cardhistory', 'operations', 'permissions', 'subsystems'].includes(active)) {
      setSections([])
      setError('')
      return
    }
    setBusy(true)
    setError('')
    setSections([])
    try {
      let next: DataSection[] = []
      if (active === 'overview') {
        next = await Promise.all([
          settledSection('Backend Readiness', 'Railway live readiness and release SHA', productionApi.systemReadiness(DEFAULT_API)),
          settledSection('Integration Readiness', 'External-provider release gates', productionApi.readiness(DEFAULT_API, token, tenantId)),
          settledSection('Treasury Positions', 'Live financial positions', productionApi.treasury(DEFAULT_API, token, tenantId, source)),
          settledSection('Data Contamination', 'Legacy Demo / Mock contamination audit', productionApi.contamination(DEFAULT_API, token, tenantId, source)),
        ])
      } else if (active === 'tenants') {
        next = [{ title: '租户与合作方', description: '来自 GET /admin/tenants', value: tenants }]
      } else if (active === 'funds') {
        next = await Promise.all([
          settledSection('Treasury', 'Reserve, available balance, hold and pending settlement', productionApi.treasury(DEFAULT_API, token, tenantId, source)),
          settledSection('Settlement Dashboard', 'Live settlement workload', productionApi.settlementDashboard(DEFAULT_API, token, tenantId, source)),
          settledSection('Reconciliation', 'Internal and external reconciliation status', productionApi.reconciliation(DEFAULT_API, token, tenantId, source)),
        ])
      } else if (active === 'dashboards') {
        next = await Promise.all([
          settledSection('Treasury Dashboard', 'Railway live business table', productionApi.treasury(DEFAULT_API, token, tenantId, source)),
          settledSection('Settlement Dashboard', 'Railway live business table', productionApi.settlementDashboard(DEFAULT_API, token, tenantId, source)),
          settledSection('Risk Dashboard', 'Declines, high-value alerts and frozen-card exposure', productionApi.riskDashboard(DEFAULT_API, token, tenantId, source)),
        ])
      } else if (active === 'merchanttesting') {
        next = await Promise.all([
          settledSection('Merchants', 'Real merchant profiles', productionApi.merchants(DEFAULT_API, token, tenantId, source)),
          settledSection('Merchant Payments', 'Real payment, clearing and settlement history', productionApi.merchantPayments(DEFAULT_API, token, tenantId, source)),
        ])
      } else if (active === 'sandbox') {
        if (source !== 'SANDBOX') {
          next = [{ title: 'BLOCKED · Environment Mismatch', description: 'Developer Sandbox 不会回退到其他数据源。', value: { currentEnvironment: source, requiredEnvironment: 'SANDBOX' } }]
        } else {
          next = await Promise.all([
            settledSection('Mock Contamination Audit', 'Sandbox source integrity', productionApi.contamination(DEFAULT_API, token, tenantId, source)),
            settledSection('Evidence Repository', 'Real stored acceptance evidence', productionApi.evidence(DEFAULT_API, token, tenantId, source)),
          ])
        }
      } else if (active === 'api') {
        next = await Promise.all([
          settledSection('API Clients', 'Tenant API clients; secret values are never returned after creation', productionApi.apiClients(DEFAULT_API, token, tenantId)),
          settledSection('Domain Events', 'Persisted event stream used for webhook operations', productionApi.events(DEFAULT_API, token, tenantId, source)),
        ])
      } else if (active === 'risk') {
        next = [await settledSection('风险与合规', 'Live risk dashboard from Railway', productionApi.riskDashboard(DEFAULT_API, token, tenantId, source))]
      } else if (active === 'system') {
        next = await Promise.all([
          settledSection('Runtime Readiness', 'Database, schema and provider configuration', productionApi.systemReadiness(DEFAULT_API)),
          settledSection('Authenticated Identity', 'Current server-side Session, roles and permissions', productionApi.me(DEFAULT_API, token)),
          settledSection('Evidence Summary', 'Immutable evidence completeness', productionApi.evidenceSummary(DEFAULT_API, token, tenantId, source)),
          settledSection('Daily Closing', 'Financial operational close and blockers', productionApi.dailyClosing(DEFAULT_API, token, tenantId, source)),
        ])
      }
      setSections(next)
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(false)
    }
  }, [active, source, tenantId, tenants, token])

  useEffect(() => { void load() }, [load])

  const switchPage = (id: NavId) => {
    setActive(id)
    setMobile(false)
    setQuery('')
    const url = new URL(window.location.href)
    url.searchParams.set('view', id)
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">F</div><div><b>FastLink</b><span>FINANCIAL SAAS CONTROL</span></div><button className="mobile-close" onClick={() => setMobile(false)}><X /></button></div>
        <div className="live-badge"><i />{source} · RAILWAY LIVE</div>
        <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => switchPage(id)}><Icon size={18} /><span>{label}</span>{unavailable[id] && <em>!</em>}</button>)}</nav>
        <div className="sidebar-foot"><div className="identity"><b>{session.user.email}</b><span>{session.user.roles.join(', ')}</span></div><button onClick={onLogout}><LogOut size={17} />退出登录</button></div>
      </aside>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      <main className="admin-main">
        <header className="topbar">
          <div className="title-wrap"><button className="menu-btn" onClick={() => setMobile(true)}><Menu /></button><div><h1>{current.label}</h1><p>FastLink Financial SaaS Platform · {source} · Railway API</p></div></div>
          <div className="top-actions">
            <span className="role-badge">{session.user.roles[0] ?? 'ADMIN'}</span>
            <select className="tenant-select" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.brandName || tenant.legalName}</option>)}</select>
            <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选当前真实数据…" /></label>
            <button className="icon-btn" onClick={() => void load()} title="刷新 Railway 数据"><RefreshCw className={busy ? 'spin' : ''} size={18} /></button>
            <button className="icon-btn" title="通知中心尚无正式读取合同"><Bell size={18} /></button>
          </div>
        </header>
        <div className="runtime-strip">
          <span><i />Data Source: <b>{source}</b></span>
          <span>Tenant: <b>{selectedTenant?.brandName || tenantId}</b></span>
          <span>API: <b>{DEFAULT_API}</b></span>
          <span>Build: <b>{runtimeConfig.buildSha.slice(0, 12)}</b></span>
        </div>
        <div className="page-content">
          {error && <div className="inline-error page-error"><Unplug />{error}</div>}
          {unavailable[active] ? <Unavailable {...unavailable[active]!} /> : null}
          {active === 'subsystems' && <DataCard section={{ title: 'FastLink 子系统能力地图', description: '状态依据当前 Railway Backend 正式 Controller 合同，不依据演示数据。', value: capabilityRows }} query={query} />}
          {active === 'permissions' && <Permissions session={session} />}
          {active === 'cardcenter' && <CardWorkspace session={session} tenantId={tenantId} mode="card" />}
          {active === 'cardhistory' && <CardWorkspace session={session} tenantId={tenantId} mode="history" />}
          {active === 'operations' && <OperationsWorkspace session={session} tenantId={tenantId} />}
          {!unavailable[active] && !['subsystems', 'permissions', 'cardcenter', 'cardhistory', 'operations'].includes(active) && (
            <>
              <PageHeading title={current.label} tenant={selectedTenant?.brandName || tenantId} source={source} busy={busy} refresh={() => void load()} />
              {busy && !sections.length ? <Loading /> : sections.map((section) => <DataCard key={section.title} section={section} query={query} />)}
              {!busy && !sections.length && <Empty />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function PageHeading({ title, tenant, source, busy, refresh }: { title: string; tenant: string; source: string; busy: boolean; refresh: () => void }) {
  return <div className="page-head"><div><span>DATA SOURCE · {source}</span><h2>{title}</h2><p>{tenant} · 页面清空旧响应后再读取 Railway，失败时不显示缓存数据。</p></div><button className="primary-btn" disabled={busy} onClick={refresh}><RefreshCw className={busy ? 'spin' : ''} />刷新真实数据</button></div>
}

function Loading() {
  return <section className="empty-state"><LoaderCircle className="spin" /><h3>正在读取 Railway API</h3><p>不会加载本地替代数据。</p></section>
}

function Empty() {
  return <section className="empty-state"><Database /><h3>NO DATA</h3><p>当前正式 API 未返回可显示记录。</p></section>
}

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return <><PageHeading title={title} tenant="External Dependency" source={runtimeConfig.environment} busy={false} refresh={() => undefined} /><section className="unavailable"><AlertTriangle /><div><h3>页面入口与设计已恢复</h3><p>{detail}</p><b>旧 Demo / Mock 数据未恢复。</b></div></section></>
}

function DataCard({ section, query }: { section: DataSection; query: string }) {
  const rows = rowsFrom(section.value)
  const filtered = query.trim() ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())) : rows
  return <article className="panel data-panel"><div className="panel-title"><div><h3>{section.title}</h3><p>{section.description}</p></div><span className="record-count">{filtered.length} RECORDS</span></div><GenericTable rows={filtered} /></article>
}

function GenericTable({ rows }: { rows: JsonRecord[] }) {
  const columns = useMemo(() => {
    const keys: string[] = []
    rows.slice(0, 20).forEach((row) => Object.keys(row).forEach((key) => { if (!keys.includes(key) && keys.length < 8) keys.push(key) }))
    return keys
  }, [rows])
  if (!rows.length) return <div className="table-empty">API 返回空集合；未生成替代记录。</div>
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(0, 200).map((row, index) => <tr key={String(row.id ?? row.traceId ?? index)}>{columns.map((column) => <td key={column} title={displayValue(row[column])}>{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div>
}

function Permissions({ session }: { session: AdminSession }) {
  const rows = [
    ...session.user.roles.map((role) => ({ type: 'ROLE', value: role, source: 'GET /admin/auth/me' })),
    ...session.user.permissions.map((permission) => ({ type: 'PERMISSION', value: permission, source: 'GET /admin/auth/me' })),
  ]
  return <><PageHeading title="Role Management" tenant={session.user.tenantId} source={session.user.environment} busy={false} refresh={() => undefined} /><section className="unavailable partial"><ShieldCheck /><div><h3>当前 Session 权限已真实接通</h3><p>Railway Backend 暂无角色目录、成员列表和权限矩阵的管理接口，因此只展示当前服务端 Session 返回的真实角色与权限。</p></div></section><DataCard section={{ title: 'Authenticated RBAC', description: 'No local role seed or fake permission matrix', value: rows }} query="" /></>
}

function CardWorkspace({ session, tenantId, mode }: { session: AdminSession; tenantId: string; mode: 'card' | 'history' }) {
  const [cardId, setCardId] = useState('')
  const [value, setValue] = useState<unknown>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = async (action: 'read' | 'balance' | 'freeze' | 'unfreeze' | 'history') => {
    if (!cardId.trim()) return
    setBusy(action)
    setError('')
    setValue(null)
    try {
      const id = cardId.trim()
      if (action === 'read') setValue(await productionApi.card(DEFAULT_API, session.accessToken, tenantId, id))
      if (action === 'balance') setValue(await productionApi.cardBalance(DEFAULT_API, session.accessToken, tenantId, id))
      if (action === 'history') setValue(await productionApi.cardTimeline(DEFAULT_API, session.accessToken, tenantId, id))
      if (action === 'freeze') setValue(await productionApi.freezeCard(DEFAULT_API, session.accessToken, tenantId, id))
      if (action === 'unfreeze') setValue(await productionApi.unfreezeCard(DEFAULT_API, session.accessToken, tenantId, id))
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy('')
    }
  }
  return <><PageHeading title={mode === 'card' ? 'Card Center' : 'Card History'} tenant={tenantId} source={session.user.environment} busy={Boolean(busy)} refresh={() => void run(mode === 'card' ? 'read' : 'history')} /><section className="lookup-panel"><div><span>REAL CARD ID REQUIRED</span><h3>{mode === 'card' ? '卡片查询与生命周期控制' : '卡片生命周期审计'}</h3><p>后台目前没有卡片列表读取合同，因此必须输入真实 Card ID；系统不会生成测试卡。</p></div><form onSubmit={(event) => { event.preventDefault(); void run(mode === 'card' ? 'read' : 'history') }}><input value={cardId} onChange={(event) => setCardId(event.target.value)} placeholder="输入 Railway 数据库中的 Card ID" /><button disabled={Boolean(busy)}><Search />查询</button></form>{mode === 'card' && <div className="action-row"><button disabled={!cardId || Boolean(busy)} onClick={() => void run('balance')}>读取余额</button><button disabled={!cardId || Boolean(busy)} onClick={() => void run('freeze')}>Freeze</button><button disabled={!cardId || Boolean(busy)} onClick={() => void run('unfreeze')}>Unfreeze</button></div>}</section>{error && <div className="inline-error page-error"><AlertTriangle />{error}</div>}{value !== null && <DataCard section={{ title: mode === 'card' ? 'Card API Response' : 'Lifecycle Timeline', description: 'Data Source: Railway Backend', value }} query="" />}</>
}

function OperationsWorkspace({ session, tenantId }: { session: AdminSession; tenantId: string }) {
  const [tab, setTab] = useState<'wallet' | 'user' | 'trace'>('wallet')
  const [lookup, setLookup] = useState('')
  const [sections, setSections] = useState<DataSection[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const source = session.user.environment as DataSource
  const run = async () => {
    setBusy(true)
    setError('')
    setSections([])
    try {
      if (tab === 'wallet') {
        setSections(await Promise.all([
          settledSection('Wallet Operations', 'Deposit, transfer and withdrawal operations', productionApi.walletOperations(DEFAULT_API, session.accessToken, tenantId, source)),
          settledSection('Wallet Transactions', 'Real transaction history', productionApi.walletTransactions(DEFAULT_API, session.accessToken, tenantId, source)),
        ]))
      } else if (tab === 'user') {
        if (!lookup.trim()) throw new Error('请输入真实 User ID')
        setSections([{ title: 'User & KYC', description: 'Real user detail and KYC status', value: await productionApi.user(DEFAULT_API, session.accessToken, tenantId, source, lookup.trim()) }])
      } else {
        if (!lookup.trim()) throw new Error('请输入真实 Trace ID')
        setSections([{ title: 'End-to-End Trace', description: 'Customer → Wallet → Card → Journal → Treasury → Settlement → Webhook → Audit', value: await productionApi.trace(DEFAULT_API, session.accessToken, tenantId, source, lookup.trim()) }])
      }
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { void run() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps
  return <><PageHeading title="终端用户运营" tenant={tenantId} source={source} busy={busy} refresh={() => void run()} /><div className="workspace-tabs"><button className={tab === 'wallet' ? 'active' : ''} onClick={() => { setTab('wallet'); setLookup('') }}>Wallet Operations</button><button className={tab === 'user' ? 'active' : ''} onClick={() => { setTab('user'); setLookup('') }}>User / KYC</button><button className={tab === 'trace' ? 'active' : ''} onClick={() => { setTab('trace'); setLookup('') }}>Trace ID</button></div>{tab !== 'wallet' && <section className="lookup-panel compact"><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder={tab === 'user' ? '真实 User ID' : '8–128 位 Trace ID'} /><button disabled={busy} onClick={() => void run()}><ChevronRight />查询</button></section>}{error && <div className="inline-error page-error"><AlertTriangle />{error}</div>}{busy && !sections.length ? <Loading /> : sections.map((section) => <DataCard key={section.title} section={section} query="" />)}</>
}
