import { AlertTriangle, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  DEFAULT_API,
  productionApi,
  type AdminSession,
  type DataSource,
} from './productionApi'
import {
  acceptsMountedResponse,
  beginRequest,
  replaceRequestAbort,
} from './requestGeneration'
import {
  parseTreasuryDailyClosing,
  parseTreasuryReconciliation,
  parseTreasuryTrialBalance,
  treasuryDashboardScope,
  TreasuryReconciliationContractError,
  treasurySessionReadAllowed,
  type TreasuryBalance,
  type TreasuryDailyClosingSummary,
  type TreasuryReconciliationSummary,
} from './treasuryReconciliationContract'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'

type TreasuryEnvironment = Extract<DataSource, 'SANDBOX' | 'TEST'>

export type TreasuryReconciliationClient = Readonly<{
  reconciliation: (token: string, tenantId: string, environment: TreasuryEnvironment, signal: AbortSignal) => Promise<string>
  trialBalance: (token: string, tenantId: string, environment: TreasuryEnvironment, signal: AbortSignal) => Promise<string>
  dailyClosing: (token: string, tenantId: string, environment: TreasuryEnvironment, signal: AbortSignal) => Promise<string>
}>

const defaultClient: TreasuryReconciliationClient = Object.freeze({
  reconciliation: (token, tenantId, environment, signal) =>
    productionApi.treasuryReconciliation(DEFAULT_API, token, tenantId, environment, signal),
  trialBalance: (token, tenantId, environment, signal) =>
    productionApi.treasuryTrialBalance(DEFAULT_API, token, tenantId, environment, signal),
  dailyClosing: (token, tenantId, environment, signal) =>
    productionApi.treasuryDailyClosing(DEFAULT_API, token, tenantId, environment, signal),
})

type EndpointState<T> =
  | Readonly<{ status: 'IDLE' | 'LOADING' }>
  | Readonly<{ status: 'READY'; value: T }>
  | Readonly<{ status: 'ERROR'; message: string }>

type TreasuryDashboardState = Readonly<{
  scope: string
  busy: boolean
  reconciliation: EndpointState<TreasuryReconciliationSummary>
  trialBalance: EndpointState<readonly TreasuryBalance[]>
  dailyClosing: EndpointState<TreasuryDailyClosingSummary>
}>

const endpoint = <T,>(status: 'IDLE' | 'LOADING'): EndpointState<T> => Object.freeze({ status })
const emptyState = (scope: string, loading = false): TreasuryDashboardState => Object.freeze({
  scope,
  busy: loading,
  reconciliation: endpoint(loading ? 'LOADING' : 'IDLE'),
  trialBalance: endpoint(loading ? 'LOADING' : 'IDLE'),
  dailyClosing: endpoint(loading ? 'LOADING' : 'IDLE'),
})

const safeError = (error: unknown): string => {
  if (error instanceof TreasuryReconciliationContractError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Admin session is not authorized for this Treasury read'
    if (error.status === 404) return 'Treasury data was not found in the selected scope'
    if (error.status === 408 || error.status === 0) return 'Treasury read is temporarily unavailable'
    if (error.status === 499) return 'Treasury read was cancelled after the scope changed'
    return `Treasury read failed · HTTP ${error.status} · Trace ${error.traceId}`
  }
  return 'Treasury response could not be verified'
}

const resultState = <T,>(result: PromiseSettledResult<T>): EndpointState<T> => result.status === 'fulfilled'
  ? Object.freeze({ status: 'READY', value: result.value })
  : Object.freeze({ status: 'ERROR', message: safeError(result.reason) })

const statusTone = (status: string): string => status === 'PASS' || status === 'MATCHED' ? 'pass' : status === 'NO_DATA' ? 'neutral' : 'blocked'

function EndpointFailure({ title, message }: { title: string; message: string }) {
  return <article className="panel treasury-endpoint-error" role="alert" data-treasury-error={title}><AlertTriangle /><div><h3>{title}</h3><p>{message}</p><b>其他已核验端点仍可独立显示；本端点不使用缓存或替代数据。</b></div></article>
}

function ReconciliationPanel({ value }: { value: TreasuryReconciliationSummary }) {
  const rows = [
    ['Overall status', value.status],
    ['Evidence present', value.evidencePresent ? 'YES' : 'NO'],
    ['Asset count', String(value.assetCount)],
    ['Imbalance count', String(value.imbalanceCount)],
    ['Exception count', String(value.exceptionCount)],
    ['Generated at', value.generatedAt],
  ] as const
  return <article className="panel treasury-summary-panel" data-treasury-panel="reconciliation"><div className="panel-title"><div><h3>Reconciliation Summary</h3><p>只显示已核验汇总，不显示银行、处理商或内部明细字段。</p></div><span className={`treasury-status ${statusTone(value.status)}`}>{value.status}</span></div><dl className="treasury-summary-grid">{rows.map(([label, item]) => <div key={label}><dt>{label}</dt><dd>{item}</dd></div>)}</dl></article>
}

function TrialBalancePanel({ rows }: { rows: readonly TreasuryBalance[] }) {
  return <article className="panel" data-treasury-panel="trial-balance"><div className="panel-title"><div><h3>Per-asset Trial Balance</h3><p>来自 Settlement trial-balance 只读合同；精确四字段白名单。</p></div><span className="record-count">{rows.length} ASSETS</span></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Debit</th><th>Credit</th><th>Balanced</th></tr></thead><tbody>{rows.map((row) => <tr key={row.assetCode}><td>{row.assetCode}</td><td>{row.debit}</td><td>{row.credit}</td><td><span className={`treasury-status ${row.balanced ? 'pass' : 'blocked'}`}>{row.balanced ? 'YES' : 'NO'}</span></td></tr>)}</tbody></table></div> : <div className="table-empty">当前作用域没有可核验的资产余额记录。</div>}</article>
}

function DailyClosingPanel({ value }: { value: TreasuryDailyClosingSummary }) {
  const activity = Object.entries(value.activity)
  return <article className="panel" data-treasury-panel="daily-closing"><div className="panel-title"><div><h3>Daily Closing</h3><p>{value.businessDate} · 仅显示安全的日终状态、活动计数与阻塞类别。</p></div><span className={`treasury-status ${statusTone(value.status)}`}>{value.status}</span></div><div className="treasury-closing-grid"><div><span>Internal financial</span><b>{value.internalFinancialStatus}</b></div><div><span>External reconciliation</span><b>{value.externalReconciliationStatus}</b></div><div><span>Closing blockers</span><b>{value.blockerCount}</b></div><div><span>Generated at</span><b>{value.generatedAt}</b></div></div><h4>Activity</h4><div className="treasury-activity-grid">{activity.map(([label, item]) => <div key={label}><span>{label}</span><b>{item}</b></div>)}</div><h4>Closing blocker categories</h4>{value.closingBlockers.length ? <ul className="treasury-blockers">{value.closingBlockers.map((blocker) => <li key={blocker}>{blocker === 'INTERNAL_RECONCILIATION' ? 'Internal reconciliation requires review' : 'External acceptance evidence is still required'}</li>)}</ul> : <div className="treasury-clear"><ShieldCheck />No closing blocker</div>}</article>
}

export function TreasuryReconciliationWorkspace({
  session,
  tenantId,
  client = defaultClient,
  now = Date.now,
}: {
  session: AdminSession
  tenantId: string
  client?: TreasuryReconciliationClient
  now?: () => number
}) {
  const environment = session.user.environment as DataSource
  const supportedEnvironment = environment === 'SANDBOX' || environment === 'TEST'
  const tokenScope = useRef<{ accessToken: string; marker: string } | null>(null)
  if (!tokenScope.current || tokenScope.current.accessToken !== session.accessToken) {
    tokenScope.current = { accessToken: session.accessToken, marker: crypto.randomUUID() }
  }
  const baseScope = `${treasuryDashboardScope(session, tenantId, environment)}\u0000${tokenScope.current.marker}`
  const currentBaseScope = useRef(baseScope)
  currentBaseScope.current = baseScope
  const currentAccessToken = useRef(session.accessToken)
  currentAccessToken.current = session.accessToken
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [state, setState] = useState<TreasuryDashboardState>(() => emptyState(baseScope))
  const visible = state.scope === baseScope ? state : emptyState(baseScope)
  const sessionAllowed = treasurySessionReadAllowed(session, environment, now())

  const load = useCallback(async () => {
    if (!supportedEnvironment || !treasurySessionReadAllowed(session, environment, now())) {
      setState(emptyState(baseScope))
      return
    }
    const treasuryEnvironment = environment as TreasuryEnvironment
    const ticket = beginRequest(lifecycle.requestGate.current, baseScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentAccessToken.current === session.accessToken
      && treasurySessionReadAllowed(session, environment, now())
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, baseScope)
    setState(emptyState(baseScope, true))
    try {
      const results = await Promise.allSettled([
        client.reconciliation(session.accessToken, tenantId, treasuryEnvironment, controller.signal)
          .then((value) => parseTreasuryReconciliation(value, treasuryEnvironment)),
        client.trialBalance(session.accessToken, tenantId, treasuryEnvironment, controller.signal)
          .then(parseTreasuryTrialBalance),
        client.dailyClosing(session.accessToken, tenantId, treasuryEnvironment, controller.signal)
          .then((value) => parseTreasuryDailyClosing(value, treasuryEnvironment)),
      ] as const)
      if (isCurrent()) {
        setState(Object.freeze({
          scope: baseScope,
          busy: true,
          reconciliation: resultState(results[0]),
          trialBalance: resultState(results[1]),
          dailyClosing: resultState(results[2]),
        }))
      }
    } finally {
      if (isCurrent()) setState((current) => current.scope === baseScope ? Object.freeze({ ...current, busy: false }) : current)
    }
  }, [baseScope, client, environment, lifecycle.mounted, lifecycle.requestAbort, lifecycle.requestGate, now, session, supportedEnvironment, tenantId])

  useEffect(() => {
    setState(emptyState(baseScope))
    if (supportedEnvironment && treasurySessionReadAllowed(session, environment, now())) void load()
  }, [baseScope, environment, load, now, session, supportedEnvironment])

  return <>
    <div className="page-head"><div><span>READ ONLY · {environment}</span><h2>资金池与清算</h2><p>{tenantId} · 三个端点独立校验；切换页面、会话、租户或环境会中止旧请求并隐藏旧快照。</p></div><button className="primary-btn" data-treasury-action="refresh" disabled={visible.busy || !sessionAllowed || !supportedEnvironment} onClick={() => void load()}><RefreshCw className={visible.busy ? 'spin' : ''} />刷新只读对账</button></div>
    {!supportedEnvironment && <section className="unavailable" data-treasury-blocked="environment"><AlertTriangle /><div><h3>Environment Gate Closed</h3><p>本工作区只允许 SANDBOX 与 TEST；不会向 UAT 或 PRODUCTION 发出请求。</p></div></section>}
    {supportedEnvironment && !sessionAllowed && <section className="unavailable" data-treasury-blocked="session"><AlertTriangle /><div><h3>Admin Session Expired</h3><p>当前会话不可继续读取；旧请求完成不会写入页面。</p></div></section>}
    {supportedEnvironment && sessionAllowed && visible.busy && visible.reconciliation.status === 'LOADING' && <section className="empty-state treasury-loading"><LoaderCircle className="spin" /><h3>正在核验只读 Treasury 合同</h3><p>不会读取缓存、原始 Provider 数据或任何生产环境。</p></section>}
    {visible.reconciliation.status === 'READY' && <ReconciliationPanel value={visible.reconciliation.value} />}
    {visible.reconciliation.status === 'ERROR' && <EndpointFailure title="Reconciliation unavailable" message={visible.reconciliation.message} />}
    {visible.trialBalance.status === 'READY' && <TrialBalancePanel rows={visible.trialBalance.value} />}
    {visible.trialBalance.status === 'ERROR' && <EndpointFailure title="Trial balance unavailable" message={visible.trialBalance.message} />}
    {visible.dailyClosing.status === 'READY' && <DailyClosingPanel value={visible.dailyClosing.value} />}
    {visible.dailyClosing.status === 'ERROR' && <EndpointFailure title="Daily closing unavailable" message={visible.dailyClosing.message} />}
  </>
}
