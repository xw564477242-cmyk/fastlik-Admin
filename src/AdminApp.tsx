import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import './card-workspace.css'
import {
  ApiError,
  DEFAULT_API,
  productionApi,
  type AdminSession,
  type DataSource,
  type Tenant,
} from './productionApi'
import {
  failedWalletOperationDetail,
  idleWalletOperationDetail,
  loadedWalletOperationDetail,
  loadingWalletOperationDetail,
  missingWalletOperationDetail,
  type WalletOperationDetailState,
} from './walletOperationDetail'
import {
  acceptsMountedResponse,
  acceptsResponse,
  abortCurrentRequest,
  beginRequest,
  createRequestGate,
  invalidateRequests,
  replaceRequestAbort,
  syncRequestScope,
} from './requestGeneration'
import {
  ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE,
  type AdminCardTransactionQuery,
} from './adminRoutes'
import {
  cardWorkspaceBaseScope,
  cardWorkspaceRequestScope,
  CardWorkspaceContractError,
  parseCardWorkspaceResponse,
  visibleCardWorkspaceState,
  type AdminCardBalance,
  type AdminCardDetail,
  type CardWorkspaceAction,
  type CardWorkspaceView,
} from './cardWorkspaceContract'
import {
  ADMIN_CARD_TRANSACTION_STATUSES,
  ADMIN_CARD_TRANSACTION_TYPES,
  appendAdminCardTransactionPage,
  cardTransactionCollectionScope,
  cardTransactionDetailScope,
  cardTransactionRequestScope,
  CardTransactionContractError,
  createCardTransactionFeed,
  parseAdminCardTransactionDetail,
  parseAdminCardTransactionPage,
  type AdminCardTransaction,
  type AdminCardTransactionFeed,
} from './cardTransactionContract'

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

function cardWorkspaceErrorText(value: unknown): string {
  if (value instanceof CardWorkspaceContractError) return value.message
  if (value instanceof CardTransactionContractError) return value.message
  if (value instanceof ApiError) {
    if (value.status === 401 || value.status === 403) return 'Admin session is not authorized for this Card request'
    if (value.status === 404) return 'Card was not found in the selected tenant'
    if (value.status === 408 || value.status === 0) return 'Card service is temporarily unavailable'
    return `Card request failed · HTTP ${value.status} · Trace ${value.traceId}`
  }
  return 'Card request could not be completed'
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
        if (!['SANDBOX', 'TEST'].includes(source)) {
          next = [{ title: 'BLOCKED · Environment Mismatch', description: '非生产模拟环境不会回退到其他数据源。', value: { currentEnvironment: source, requiredEnvironment: 'SANDBOX_OR_TEST' } }]
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

function CardFields({ card }: { card: AdminCardDetail }) {
  const fields = [
    ['Card ID', card.id], ['Type', card.type], ['Status', card.status], ['Last 4', card.last4],
    ['Expiry month', card.expiryMonth], ['Expiry year', card.expiryYear], ['Currency', card.currency], ['Alias', card.alias],
  ] as const
  return <dl className="card-contract-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
}

function BalanceFields({ balance }: { balance: AdminCardBalance }) {
  const fields = [
    ['Available (minor)', balance.availableBalanceMinor], ['Current (minor)', balance.currentBalanceMinor],
    ['Pending (minor)', balance.pendingAmountMinor], ['Currency', balance.currency], ['Updated at', balance.updatedAt],
  ] as const
  return <dl className="card-contract-grid balance-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function CardReadOnlyPanel({ view, description }: { view: Extract<CardWorkspaceView, { kind: 'CARD' | 'BALANCE' }>; description: string }) {
  return <article className="panel card-contract-panel"><div className="panel-title"><div><h3>{view.kind === 'CARD' ? 'Card Detail' : 'Card Balance'}</h3><p>{description}</p></div><span className="record-count">TYPED CONTRACT</span></div>{view.kind === 'CARD' ? <><CardFields card={view.value} />{view.value.balance && <><h4>Balance snapshot</h4><BalanceFields balance={view.value.balance} /></>}</> : <BalanceFields balance={view.value} />}</article>
}

function TransactionFields({ transaction }: { transaction: AdminCardTransaction }) {
  return <dl className="card-contract-grid">{Object.entries(transaction).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
}

function CardTransactionsPanel({ feed, selected, busy, next, select }: {
  feed: AdminCardTransactionFeed
  selected: AdminCardTransaction | null
  busy: boolean
  next: () => void
  select: (transactionId: string) => void
}) {
  const rows = feed.transactions.map((transaction) => ({
    id: transaction.id,
    status: transaction.status,
    type: transaction.type,
    amountMinor: transaction.amountMinor,
    authorizedAmountMinor: transaction.authorizedAmountMinor,
    clearedAmountMinor: transaction.clearedAmountMinor,
    settledAmountMinor: transaction.settledAmountMinor,
    reversedAmountMinor: transaction.reversedAmountMinor,
    refundedAmountMinor: transaction.refundedAmountMinor,
    currency: transaction.currency,
    merchantName: transaction.merchantName,
    merchantCategory: transaction.merchantCategory,
    occurredAt: transaction.occurredAt,
  }))
  return <section className="card-transaction-results"><DataCard section={{ title: 'Card Transactions', description: 'Data Source: Railway Backend · 精确 13 个公开字段，只读 GET', value: rows }} query="" /><label className="card-transaction-detail-select">交易详情<select value={selected?.id ?? ''} disabled={busy} onChange={(event) => { if (event.target.value) select(event.target.value) }}><option value="">选择交易</option>{feed.transactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.id}</option>)}</select></label>{selected && <article className="panel card-contract-panel"><div className="panel-title"><div><h3>Card Transaction Detail</h3><p>独立详情 GET 已绑定当前管理员、租户、环境、Card、筛选条件和交易 ID。</p></div><span className="record-count">EXACT 13 FIELDS</span></div><TransactionFields transaction={selected} /></article>}{feed.nextCursor && <button className="card-transaction-next" disabled={busy} onClick={next}>{busy ? '读取中…' : '下一页'}</button>}</section>
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
  const [view, setView] = useState<CardWorkspaceView | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [transactionQuery, setTransactionQuery] = useState<AdminCardTransactionQuery>({ status: 'ALL', limit: 25 })
  const [transactionFeed, setTransactionFeed] = useState<AdminCardTransactionFeed>(() => createCardTransactionFeed(''))
  const [selectedTransaction, setSelectedTransaction] = useState<AdminCardTransaction | null>(null)
  const [transactionsLoaded, setTransactionsLoaded] = useState(false)
  const mounted = useRef(false)
  const transactionAbort = useRef<AbortController | null>(null)
  const source = session.user.environment as DataSource
  const baseScope = cardWorkspaceBaseScope(session.user.id, session.expiresAt, tenantId, source, mode)
  const requestGate = useRef(createRequestGate(baseScope))
  syncRequestScope(requestGate.current, baseScope)
  const stateScope = useRef(baseScope)
  const display = visibleCardWorkspaceState(stateScope.current, baseScope, { cardId, view, busy, error })
  const scopeIsCurrent = stateScope.current === baseScope
  const collectionScope = cardTransactionCollectionScope(session.user.id, session.expiresAt, tenantId, source, display.cardId.trim(), transactionQuery)
  const visibleTransactionFeed = transactionFeed.scope === collectionScope
    ? transactionFeed
    : createCardTransactionFeed(collectionScope)

  const run = async (action: CardWorkspaceAction, cursor: string | null = null) => {
    if (!scopeIsCurrent) return
    const id = cardId.trim()
    if (!id) {
      abortCurrentRequest(transactionAbort)
      invalidateRequests(requestGate.current)
      setBusy('')
      setError('请输入真实 Card ID')
      setView(null)
      setTransactionFeed(createCardTransactionFeed(collectionScope))
      setSelectedTransaction(null)
      setTransactionsLoaded(false)
      return
    }
    const transactionScope = cardTransactionCollectionScope(session.user.id, session.expiresAt, tenantId, source, id, transactionQuery)
    const requestScope = action === 'transactions'
      ? cardTransactionRequestScope(session.user.id, session.expiresAt, tenantId, source, id, transactionQuery, cursor)
      : cardWorkspaceRequestScope(session.user.id, session.expiresAt, tenantId, source, mode, id, action)
    const ticket = beginRequest(requestGate.current, requestScope)
    const controller = action === 'transactions' ? replaceRequestAbort(transactionAbort) : null
    const previousFeed = cursor === null ? createCardTransactionFeed(transactionScope) : visibleTransactionFeed
    setBusy(action)
    setError('')
    setView(null)
    if (action === 'transactions' && cursor === null) {
      setTransactionFeed(previousFeed)
      setSelectedTransaction(null)
      setTransactionsLoaded(false)
    }
    try {
      let value: unknown
      if (action === 'read') value = await productionApi.card(DEFAULT_API, session.accessToken, tenantId, id)
      if (action === 'balance') value = await productionApi.cardBalance(DEFAULT_API, session.accessToken, tenantId, id)
      if (action === 'history') value = await productionApi.cardTimeline(DEFAULT_API, session.accessToken, tenantId, id)
      if (action === 'transactions') value = await productionApi.cardTransactions(DEFAULT_API, session.accessToken, tenantId, id, transactionQuery, cursor ?? undefined, controller?.signal)
      if (action === 'freeze') value = await productionApi.freezeCard(DEFAULT_API, session.accessToken, tenantId, id)
      if (action === 'unfreeze') value = await productionApi.unfreezeCard(DEFAULT_API, session.accessToken, tenantId, id)
      if (acceptsMountedResponse(mounted.current, requestGate.current, ticket, requestScope)) {
        if (action === 'transactions') {
          const page = parseAdminCardTransactionPage(value, transactionQuery)
          setTransactionFeed(appendAdminCardTransactionPage(previousFeed, page, cursor, transactionScope))
          setTransactionsLoaded(true)
        } else {
          setView(parseCardWorkspaceResponse(action, value, id))
        }
      }
    } catch (error) {
      if (acceptsMountedResponse(mounted.current, requestGate.current, ticket, requestScope)) setError(cardWorkspaceErrorText(error))
    } finally {
      if (acceptsMountedResponse(mounted.current, requestGate.current, ticket, requestScope)) setBusy('')
    }
  }

  const selectTransaction = async (transactionId: string) => {
    if (!scopeIsCurrent) return
    const id = cardId.trim()
    if (!id || !visibleTransactionFeed.transactions.some((transaction) => transaction.id === transactionId)) {
      abortCurrentRequest(transactionAbort)
      invalidateRequests(requestGate.current)
      setSelectedTransaction(null)
      setBusy('')
      setError('交易详情不属于当前 Card 与筛选结果')
      return
    }
    const requestScope = cardTransactionDetailScope(session.user.id, session.expiresAt, tenantId, source, id, transactionQuery, transactionId)
    const ticket = beginRequest(requestGate.current, requestScope)
    const controller = replaceRequestAbort(transactionAbort)
    setBusy('transaction-detail')
    setError('')
    setSelectedTransaction(null)
    try {
      const value = await productionApi.cardTransaction(DEFAULT_API, session.accessToken, tenantId, id, transactionId, controller.signal)
      if (acceptsMountedResponse(mounted.current, requestGate.current, ticket, requestScope)) {
        setSelectedTransaction(parseAdminCardTransactionDetail(value, transactionId, transactionQuery))
      }
    } catch (error) {
      if (acceptsMountedResponse(mounted.current, requestGate.current, ticket, requestScope)) setError(cardWorkspaceErrorText(error))
    } finally {
      if (acceptsMountedResponse(mounted.current, requestGate.current, ticket, requestScope)) setBusy('')
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abortCurrentRequest(transactionAbort)
      invalidateRequests(requestGate.current)
    }
  }, [])

  useEffect(() => {
    syncRequestScope(requestGate.current, baseScope)
    abortCurrentRequest(transactionAbort)
    invalidateRequests(requestGate.current)
    stateScope.current = baseScope
    setCardId('')
    setView(null)
    setTransactionFeed(createCardTransactionFeed(cardTransactionCollectionScope(session.user.id, session.expiresAt, tenantId, source, '', transactionQuery)))
    setSelectedTransaction(null)
    setTransactionsLoaded(false)
    setError('')
    setBusy('')
  }, [baseScope])

  const changeCardId = (next: string) => {
    abortCurrentRequest(transactionAbort)
    invalidateRequests(requestGate.current)
    setCardId(next)
    setView(null)
    setTransactionFeed(createCardTransactionFeed(cardTransactionCollectionScope(session.user.id, session.expiresAt, tenantId, source, next.trim(), transactionQuery)))
    setSelectedTransaction(null)
    setTransactionsLoaded(false)
    setError('')
    setBusy('')
  }
  const changeTransactionQuery = (patch: Partial<AdminCardTransactionQuery>) => {
    const next = { ...transactionQuery, ...patch }
    abortCurrentRequest(transactionAbort)
    invalidateRequests(requestGate.current)
    setTransactionQuery(next)
    setTransactionFeed(createCardTransactionFeed(cardTransactionCollectionScope(session.user.id, session.expiresAt, tenantId, source, cardId.trim(), next)))
    setSelectedTransaction(null)
    setTransactionsLoaded(false)
    setError('')
    setBusy('')
  }
  const changeTransactionStatus = (status: AdminCardTransactionQuery['status']) => {
    const type = transactionQuery.type
    changeTransactionQuery({
      status,
      ...(status !== 'ALL' && type && ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE[type] !== status ? { type: undefined } : {}),
    })
  }
  const changeTransactionType = (type: AdminCardTransactionQuery['type']) => {
    const status = transactionQuery.status
    changeTransactionQuery({
      type,
      ...(type && status !== 'ALL' && ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE[type] !== status ? { status: 'ALL' as const } : {}),
    })
  }
  const description = display.view?.truncated
    ? 'Data Source: Railway Backend · 显示最近 200 条公开事件'
    : 'Data Source: Railway Backend · 仅显示 Admin 公开字段'
  const hasTransactionResults = visibleTransactionFeed.transactions.length > 0
  return <><PageHeading title={mode === 'card' ? 'Card Center' : 'Card History'} tenant={tenantId} source={source} busy={Boolean(display.busy)} refresh={() => { if (scopeIsCurrent) void run(mode === 'card' ? 'read' : 'history') }} /><section className="lookup-panel"><div><span>REAL CARD ID REQUIRED</span><h3>{mode === 'card' ? '卡片查询与生命周期控制' : '卡片生命周期审计'}</h3><p>必须输入真实 Card ID；切换管理员会话、租户、环境、页面或 Card ID 会立即清除旧响应。</p></div><form onSubmit={(event) => { event.preventDefault(); if (scopeIsCurrent) void run(mode === 'card' ? 'read' : 'history') }}><input value={display.cardId} disabled={!scopeIsCurrent} onChange={(event) => changeCardId(event.target.value)} placeholder="输入 Railway 数据库中的 Card ID" /><button disabled={!scopeIsCurrent || Boolean(display.busy)}><Search />查询</button></form>{mode === 'card' && <><div className="action-row"><button disabled={!scopeIsCurrent || !display.cardId || Boolean(display.busy)} onClick={() => void run('balance')}>读取余额</button><button disabled={!scopeIsCurrent || !display.cardId || Boolean(display.busy)} onClick={() => void run('freeze')}>Freeze</button><button disabled={!scopeIsCurrent || !display.cardId || Boolean(display.busy)} onClick={() => void run('unfreeze')}>Unfreeze</button></div><div className="card-transaction-filters"><label>状态<select value={transactionQuery.status} disabled={Boolean(display.busy)} onChange={(event) => changeTransactionStatus(event.target.value as AdminCardTransactionQuery['status'])}><option value="ALL">ALL</option>{ADMIN_CARD_TRANSACTION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label>类型<select value={transactionQuery.type ?? ''} disabled={Boolean(display.busy)} onChange={(event) => changeTransactionType(event.target.value ? event.target.value as AdminCardTransactionQuery['type'] : undefined)}><option value="">全部</option>{ADMIN_CARD_TRANSACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>币种<input maxLength={3} value={transactionQuery.currency ?? ''} disabled={Boolean(display.busy)} onChange={(event) => changeTransactionQuery({ currency: event.target.value.toUpperCase() || undefined })} placeholder="USD" /></label><label>开始日期<input type="date" value={transactionQuery.from ?? ''} disabled={Boolean(display.busy)} onChange={(event) => changeTransactionQuery({ from: event.target.value || undefined })} /></label><label>结束日期<input type="date" value={transactionQuery.to ?? ''} disabled={Boolean(display.busy)} onChange={(event) => changeTransactionQuery({ to: event.target.value || undefined })} /></label><label>每页<select value={transactionQuery.limit} disabled={Boolean(display.busy)} onChange={(event) => changeTransactionQuery({ limit: Number(event.target.value) })}><option value={10}>10</option><option value={25}>25</option></select></label><button disabled={!scopeIsCurrent || !display.cardId || Boolean(display.busy)} onClick={() => void run('transactions')}>读取交易</button></div></>}</section>{display.error && <div className="inline-error page-error"><AlertTriangle />{display.error}</div>}{display.view?.empty && <section className="empty-state"><Search /><h3>NO CARD EVENTS</h3><p>当前 Card 没有可显示的公开生命周期事件。</p></section>}{display.view && !display.view.empty && (display.view.kind === 'TIMELINE' ? <DataCard section={{ title: 'Lifecycle Timeline', description, value: display.view.value }} query="" /> : <CardReadOnlyPanel view={display.view} description={description} />)}{mode === 'card' && hasTransactionResults && <CardTransactionsPanel feed={visibleTransactionFeed} selected={selectedTransaction} busy={Boolean(display.busy)} select={(transactionId) => void selectTransaction(transactionId)} next={() => { if (visibleTransactionFeed.nextCursor) void run('transactions', visibleTransactionFeed.nextCursor) }} />}{mode === 'card' && transactionsLoaded && !hasTransactionResults && visibleTransactionFeed.scope === collectionScope && display.busy !== 'transactions' && transactionFeed.scope === collectionScope && <section className="empty-state card-transaction-empty"><Search /><h3>NO CARD TRANSACTIONS</h3><p>当前筛选条件下没有可显示的公开交易。</p></section>}</>
}

function OperationsWorkspace({ session, tenantId }: { session: AdminSession; tenantId: string }) {
  const [tab, setTab] = useState<'wallet' | 'operation' | 'user' | 'trace'>('wallet')
  const [lookup, setLookup] = useState('')
  const [sections, setSections] = useState<DataSection[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [operationDetail, setOperationDetail] = useState<WalletOperationDetailState>(idleWalletOperationDetail)
  const source = session.user.environment as DataSource
  const requestScope = `${tenantId}\u0000${source}\u0000${tab}`
  const requestGate = useRef(createRequestGate(requestScope))
  syncRequestScope(requestGate.current, requestScope)
  const run = async () => {
    const ticket = beginRequest(requestGate.current, requestScope)
    if (tab === 'operation') {
      const operationId = lookup.trim()
      if (!operationId) {
        const missing = missingWalletOperationDetail()
        setBusy(missing.busy)
        setSections([...missing.sections])
        setError(missing.pageError)
        setOperationDetail(missing.detail)
        return
      }
      setBusy(true)
      setError('')
      setSections([])
      setOperationDetail(loadingWalletOperationDetail())
      try {
        const value = await productionApi.walletOperation(
          DEFAULT_API,
          session.accessToken,
          tenantId,
          operationId,
          source,
        )
        if (acceptsResponse(requestGate.current, ticket, requestScope)) {
          setOperationDetail(loadedWalletOperationDetail(value, {
            operationId,
            tenantId,
            environment: source,
          }))
        }
      } catch (error) {
        if (acceptsResponse(requestGate.current, ticket, requestScope)) setOperationDetail(failedWalletOperationDetail(error))
      } finally {
        if (acceptsResponse(requestGate.current, ticket, requestScope)) setBusy(false)
      }
      return
    }
    setBusy(true)
    setError('')
    setSections([])
    try {
      if (tab === 'wallet') {
        const next = await Promise.all([
          settledSection('Wallet Operations', 'Deposit, transfer and withdrawal operations', productionApi.walletOperations(DEFAULT_API, session.accessToken, tenantId, source)),
          settledSection('Wallet Transactions', 'Real transaction history', productionApi.walletTransactions(DEFAULT_API, session.accessToken, tenantId, source)),
        ])
        if (acceptsResponse(requestGate.current, ticket, requestScope)) setSections(next)
      } else if (tab === 'user') {
        if (!lookup.trim()) throw new Error('请输入真实 User ID')
        const value = await productionApi.user(DEFAULT_API, session.accessToken, tenantId, source, lookup.trim())
        if (acceptsResponse(requestGate.current, ticket, requestScope)) setSections([{ title: 'User & KYC', description: 'Real user detail and KYC status', value }])
      } else {
        if (!lookup.trim()) throw new Error('请输入真实 Trace ID')
        const value = await productionApi.trace(DEFAULT_API, session.accessToken, tenantId, source, lookup.trim())
        if (acceptsResponse(requestGate.current, ticket, requestScope)) setSections([{ title: 'End-to-End Trace', description: 'Customer → Wallet → Card → Journal → Treasury → Settlement → Webhook → Audit', value }])
      }
    } catch (error) {
      if (acceptsResponse(requestGate.current, ticket, requestScope)) setError(errorText(error))
    } finally {
      if (acceptsResponse(requestGate.current, ticket, requestScope)) setBusy(false)
    }
  }
  useEffect(() => {
    invalidateRequests(requestGate.current)
    setLookup('')
    setOperationDetail(idleWalletOperationDetail())
    if (tab === 'wallet') void run()
    else {
      setSections([])
      setError('')
      setBusy(false)
    }
  }, [tenantId, tab, source]) // eslint-disable-line react-hooks/exhaustive-deps
  const switchTab = (next: 'wallet' | 'operation' | 'user' | 'trace') => {
    invalidateRequests(requestGate.current)
    setTab(next)
    setLookup('')
    setSections([])
    setError('')
    setBusy(false)
    setOperationDetail(idleWalletOperationDetail())
  }
  const placeholder = tab === 'operation' ? '真实 Wallet Operation ID' : tab === 'user' ? '真实 User ID' : '8–128 位 Trace ID'
  return <><PageHeading title="终端用户运营" tenant={tenantId} source={source} busy={busy} refresh={() => void run()} /><div className="workspace-tabs"><button className={tab === 'wallet' ? 'active' : ''} onClick={() => switchTab('wallet')}>Wallet Operations</button><button className={tab === 'operation' ? 'active' : ''} onClick={() => switchTab('operation')}>Operation Detail</button><button className={tab === 'user' ? 'active' : ''} onClick={() => switchTab('user')}>User / KYC</button><button className={tab === 'trace' ? 'active' : ''} onClick={() => switchTab('trace')}>Trace ID</button></div>{tab !== 'wallet' && <section className="lookup-panel compact"><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder={placeholder} /><button disabled={busy} onClick={() => void run()}><ChevronRight />查询</button></section>}{error && <div className="inline-error page-error"><AlertTriangle />{error}</div>}{operationDetail.status === 'LOADING' && <Loading />}{operationDetail.status === 'NOT_FOUND' && <section className="empty-state"><Search /><h3>WALLET OPERATION NOT FOUND</h3><p>{operationDetail.message}</p></section>}{operationDetail.status === 'CONTRACT_ERROR' && <div className="inline-error page-error"><AlertTriangle />Backend Wallet Operation contract error · {operationDetail.message}</div>}{operationDetail.status === 'ERROR' && <div className="inline-error page-error"><AlertTriangle />{operationDetail.message}</div>}{operationDetail.status === 'SUCCESS' && <><DataCard section={{ title: 'Wallet Operation', description: `${source} · Validated operation identity, status, asset and amount`, value: [operationDetail.value.operation] }} query="" /><DataCard section={{ title: 'Wallet Accounts', description: 'Validated source and destination account summary', value: operationDetail.value.accounts }} query="" /><DataCard section={{ title: 'Journal Summary', description: 'Validated journal and entry counts; raw entries are not rendered', value: operationDetail.value.journals }} query="" /><DataCard section={{ title: 'Treasury Summary', description: 'Validated treasury position for the operation asset', value: operationDetail.value.treasury ? [operationDetail.value.treasury] : [] }} query="" /></>}{tab !== 'operation' && (busy && !sections.length ? <Loading /> : sections.map((section) => <DataCard key={section.title} section={section} query="" />))}</>
}
