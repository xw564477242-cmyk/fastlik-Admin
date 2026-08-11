import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  DEFAULT_API,
  productionApi,
  type AdminSession,
  type DataSource,
  type Journal,
  type TrialBalance,
  type WalletAccount,
} from './productionApi'

type LedgerEnvironment = Extract<DataSource, 'SANDBOX' | 'TEST'>

export type LedgerClient = Readonly<{
  accounts: (token: string, tenantId: string, environment: LedgerEnvironment, signal: AbortSignal) => Promise<WalletAccount[]>
  journals: (token: string, tenantId: string, environment: LedgerEnvironment, signal: AbortSignal) => Promise<Journal[]>
  trialBalance: (token: string, tenantId: string, environment: LedgerEnvironment, signal: AbortSignal) => Promise<TrialBalance[]>
}>

const defaultClient: LedgerClient = Object.freeze({
  accounts: (token, tenantId, environment, signal) => productionApi.accounts(DEFAULT_API, token, tenantId, environment, signal),
  journals: (token, tenantId, environment, signal) => productionApi.journals(DEFAULT_API, token, tenantId, environment, signal),
  trialBalance: (token, tenantId, environment, signal) => productionApi.trialBalance(DEFAULT_API, token, tenantId, environment, signal),
})

type EndpointState<T> = Readonly<{ status: 'IDLE' | 'LOADING' }> | Readonly<{ status: 'READY'; value: T }> | Readonly<{ status: 'ERROR'; message: string }>
type LedgerView = Readonly<{
  scope: string
  busy: boolean
  accounts: EndpointState<WalletAccount[]>
  journals: EndpointState<Journal[]>
  trialBalance: EndpointState<TrialBalance[]>
}>

const endpoint = <T,>(status: 'IDLE' | 'LOADING'): EndpointState<T> => Object.freeze({ status })
const emptyView = (scope: string, loading = false): LedgerView => Object.freeze({
  scope,
  busy: loading,
  accounts: endpoint(loading ? 'LOADING' : 'IDLE'),
  journals: endpoint(loading ? 'LOADING' : 'IDLE'),
  trialBalance: endpoint(loading ? 'LOADING' : 'IDLE'),
})

const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Admin session is not authorized for this Ledger read'
    if (error.status === 404) return 'Ledger data was not found in the selected scope'
    if (error.status === 408 || error.status === 0) return 'Ledger read is temporarily unavailable'
    return `Ledger read failed · HTTP ${error.status} · Trace ${error.traceId}`
  }
  return error instanceof Error ? error.message : 'Ledger response could not be verified'
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return <article className="panel treasury-endpoint-error" role="alert"><AlertTriangle /><div><h3>{title}</h3><p>{message}</p><b>该端点不使用缓存或 Mock；其他已核验端点可独立显示。</b></div></article>
}

function AccountsPanel({ rows }: { rows: WalletAccount[] }) {
  return <article className="panel"><div className="panel-title"><div><h3>Ledger Accounts</h3><p>当前租户与环境的真实账务科目，不跨租户汇总。</p></div><span className="record-count">{rows.length} RECORDS</span></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Customer</th><th>Asset</th><th>Purpose</th><th>Status</th><th>Posted</th><th>Pending</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.accountCode}</td><td>{row.name}</td><td>{row.customerId ?? '—'}</td><td>{row.assetCode}</td><td>{row.purpose}</td><td>{row.status}</td><td>{row.postedBalance}</td><td>{row.pendingBalance}</td></tr>)}</tbody></table></div> : <div className="table-empty">当前作用域没有 Ledger Account；未生成替代记录。</div>}</article>
}

function JournalsPanel({ rows }: { rows: Journal[] }) {
  return <article className="panel"><div className="panel-title"><div><h3>Ledger Journals</h3><p>显示日记账公开摘要；不会把原始分录对象直接写入页面。</p></div><span className="record-count">{rows.length} RECORDS</span></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Posted</th><th>ID</th><th>Reference type</th><th>Reference</th><th>Description</th><th>Status</th><th>Entries</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.postedAt}</td><td>{row.id}</td><td>{row.referenceType}</td><td>{row.referenceId ?? '—'}</td><td>{row.description}</td><td>{row.status}</td><td>{row.entries.length}</td></tr>)}</tbody></table></div> : <div className="table-empty">当前作用域没有 Ledger Journal；未生成替代记录。</div>}</article>
}

function TrialBalancePanel({ rows }: { rows: TrialBalance[] }) {
  return <article className="panel"><div className="panel-title"><div><h3>Ledger Trial Balance</h3><p>按资产展示借贷平衡；USDT 与法币不会相加。</p></div><span className="record-count">{rows.length} ASSETS</span></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Debit</th><th>Credit</th><th>Balanced</th></tr></thead><tbody>{rows.map((row) => <tr key={row.assetCode}><td>{row.assetCode}</td><td>{row.debit}</td><td>{row.credit}</td><td>{row.balanced ? 'YES' : 'NO'}</td></tr>)}</tbody></table></div> : <div className="table-empty">当前作用域没有 Trial Balance；未生成替代记录。</div>}</article>
}

export function LedgerWorkspace({ session, tenantId, invalidateSession, client = defaultClient, now = Date.now }: {
  session: AdminSession
  tenantId: string
  invalidateSession: (expectedAccessToken: string) => void
  client?: LedgerClient
  now?: () => number
}) {
  const environment = session.user.environment as DataSource
  const supported = environment === 'SANDBOX' || environment === 'TEST'
  const liveSession = Date.parse(session.expiresAt) > now()
  const tokenMarker = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenMarker.current || tokenMarker.current.token !== session.accessToken) tokenMarker.current = { token: session.accessToken, marker: crypto.randomUUID() }
  const scope = `${session.user.id}\u0000${session.user.tenantId}\u0000${tenantId}\u0000${environment}\u0000${session.expiresAt}\u0000${tokenMarker.current.marker}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const request = useRef<AbortController | null>(null)
  const [view, setView] = useState<LedgerView>(() => emptyView(scope))
  const visible = view.scope === scope ? view : emptyView(scope)

  const load = useCallback(async () => {
    if (!supported || !liveSession) { setView(emptyView(scope)); return }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const token = session.accessToken
    const ledgerEnvironment = environment as LedgerEnvironment
    setView(emptyView(scope, true))
    const [accounts, journals, trialBalance] = await Promise.allSettled([
      client.accounts(token, tenantId, ledgerEnvironment, controller.signal),
      client.journals(token, tenantId, ledgerEnvironment, controller.signal),
      client.trialBalance(token, tenantId, ledgerEnvironment, controller.signal),
    ])
    if (controller.signal.aborted || request.current !== controller || currentScope.current !== scope || Date.parse(session.expiresAt) <= now()) return
    const failures = [accounts, journals, trialBalance].filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failures.some((result) => result.reason instanceof ApiError && result.reason.status === 401)) {
      invalidateSession(token)
      setView(emptyView(scope))
      request.current = null
      return
    }
    const publish = <T,>(result: PromiseSettledResult<T>): EndpointState<T> => result.status === 'fulfilled'
      ? Object.freeze({ status: 'READY', value: result.value })
      : Object.freeze({ status: 'ERROR', message: errorMessage(result.reason) })
    setView(Object.freeze({ scope, busy: false, accounts: publish(accounts), journals: publish(journals), trialBalance: publish(trialBalance) }))
    request.current = null
  }, [client, environment, invalidateSession, liveSession, now, scope, session.accessToken, session.expiresAt, supported, tenantId])

  useEffect(() => {
    request.current?.abort()
    setView(emptyView(scope))
    if (supported && liveSession) void load()
    return () => request.current?.abort()
  }, [liveSession, load, scope, supported])

  return <section data-ledger-workspace>
    <div className="page-head"><div><span>READ ONLY · {environment}</span><h2>Ledger</h2><p>{tenantId} · Accounts、Journals 与 Trial Balance 绑定当前管理员会话和环境。</p></div><button className="primary-btn" disabled={visible.busy || !supported || !liveSession} onClick={() => void load()}><RefreshCw className={visible.busy ? 'spin' : ''} />刷新账务数据</button></div>
    {(!supported || !liveSession) && <section className="unavailable"><AlertTriangle /><div><h3>Ledger Gate Closed</h3><p>只允许有效 SANDBOX/TEST Admin Session；不会向 UAT 或 PRODUCTION 请求数据。</p></div></section>}
    {visible.busy && <section className="empty-state"><LoaderCircle className="spin" /><h3>正在核验 Ledger</h3><p>不会加载本地或 Lovable Mock。</p></section>}
    {visible.accounts.status === 'READY' && <AccountsPanel rows={visible.accounts.value} />}
    {visible.accounts.status === 'ERROR' && <ErrorPanel title="Ledger Accounts unavailable" message={visible.accounts.message} />}
    {visible.journals.status === 'READY' && <JournalsPanel rows={visible.journals.value} />}
    {visible.journals.status === 'ERROR' && <ErrorPanel title="Ledger Journals unavailable" message={visible.journals.message} />}
    {visible.trialBalance.status === 'READY' && <TrialBalancePanel rows={visible.trialBalance.value} />}
    {visible.trialBalance.status === 'ERROR' && <ErrorPanel title="Trial Balance unavailable" message={visible.trialBalance.message} />}
  </section>
}
