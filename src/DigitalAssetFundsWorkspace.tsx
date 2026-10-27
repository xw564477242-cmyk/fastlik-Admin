import { AlertTriangle, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, DEFAULT_API, productionApi, type AdminSession } from './productionApi'
import {
  WalletAssetSummaryContractError,
  walletAssetSummarySessionReadAllowed,
  type WalletAssetSummary,
  type WalletAssetSummaryEnvironment,
} from './walletAssetSummaryContract'

export type DigitalAssetFundsClient = Readonly<{
  summary: (
    token: string,
    tenantId: string,
    environment: WalletAssetSummaryEnvironment,
    customerId: string | undefined,
    signal: AbortSignal,
  ) => Promise<WalletAssetSummary>
}>

const defaultClient: DigitalAssetFundsClient = Object.freeze({
  summary: (token, tenantId, environment, customerId, signal) =>
    productionApi.walletAssetSummary(DEFAULT_API, token, tenantId, environment, customerId, signal),
})

type AssetView = Readonly<{
  scope: string
  status: 'IDLE' | 'LOADING' | 'READY' | 'ERROR'
  value: WalletAssetSummary | null
  error: string
}>

const emptyView = (scope: string, status: AssetView['status'] = 'IDLE'): AssetView => Object.freeze({ scope, status, value: null, error: '' })
const customerPattern = /^[A-Za-z0-9_-]{2,100}$/

const safeError = (error: unknown): string => {
  if (error instanceof WalletAssetSummaryContractError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Admin session is not authorized for this asset summary'
    if (error.status === 404) return 'No customer Wallet account exists in the selected scope'
    if (error.status === 408 || error.status === 0) return 'Digital asset summary is temporarily unavailable'
    return `Digital asset summary failed · HTTP ${error.status} · Trace ${error.traceId}`
  }
  return error instanceof Error ? error.message : 'Digital asset summary could not be verified'
}

export function DigitalAssetFundsWorkspace({ session, tenantId, invalidateSession, client = defaultClient, now = Date.now }: {
  session: AdminSession
  tenantId: string
  invalidateSession: (expectedAccessToken: string) => void
  client?: DigitalAssetFundsClient
  now?: () => number
}) {
  const environment = session.user.environment
  const supported = environment === 'SANDBOX' || environment === 'TEST'
  const liveSession = walletAssetSummarySessionReadAllowed(session, environment, now())
  const [draftCustomer, setDraftCustomer] = useState('')
  const [customerId, setCustomerId] = useState<string | undefined>()
  const customerValid = !draftCustomer.trim() || customerPattern.test(draftCustomer.trim())
  const tokenMarker = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenMarker.current || tokenMarker.current.token !== session.accessToken) tokenMarker.current = { token: session.accessToken, marker: crypto.randomUUID() }
  const scope = `${session.user.id}\u0000${session.user.tenantId}\u0000${tenantId}\u0000${environment}\u0000${session.expiresAt}\u0000${tokenMarker.current.marker}\u0000${customerId ?? ''}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const request = useRef<AbortController | null>(null)
  const [view, setView] = useState<AssetView>(() => emptyView(scope))
  const visible = view.scope === scope ? view : emptyView(scope)

  const load = useCallback(async () => {
    if (!supported || !liveSession) { setView(emptyView(scope)); return }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const token = session.accessToken
    const summaryEnvironment = environment as WalletAssetSummaryEnvironment
    setView(emptyView(scope, 'LOADING'))
    try {
      const value = await client.summary(token, tenantId, summaryEnvironment, customerId, controller.signal)
      if (controller.signal.aborted || request.current !== controller || currentScope.current !== scope || !walletAssetSummarySessionReadAllowed(session, environment, now())) return
      setView(Object.freeze({ scope, status: 'READY', value, error: '' }))
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller || currentScope.current !== scope || !walletAssetSummarySessionReadAllowed(session, environment, now())) return
      if (error instanceof ApiError && error.status === 401) {
        invalidateSession(token)
        setView(emptyView(scope))
      } else {
        setView(Object.freeze({ scope, status: 'ERROR', value: null, error: safeError(error) }))
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }, [client, customerId, environment, invalidateSession, liveSession, now, scope, session, supported, tenantId])

  useEffect(() => {
    request.current?.abort()
    setView(emptyView(scope))
    if (supported && liveSession) void load()
    return () => request.current?.abort()
  }, [liveSession, load, scope, supported])

  const applyCustomer = () => {
    const next = draftCustomer.trim()
    if (!next || customerPattern.test(next)) setCustomerId(next || undefined)
  }

  return <section data-digital-asset-funds-workspace>
    <div className="page-head"><div><span>READ ONLY · {environment}</span><h2>Digital Asset Funds</h2><p>{tenantId} · 真实 Wallet asset summary；USDT 与各法币按资产独立显示。</p></div><button className="primary-btn" disabled={visible.status === 'LOADING' || !supported || !liveSession} onClick={() => void load()}><RefreshCw className={visible.status === 'LOADING' ? 'spin' : ''} />刷新资产总览</button></div>
    {(!supported || !liveSession) && <section className="unavailable"><AlertTriangle /><div><h3>Digital Asset Gate Closed</h3><p>只允许有效 SANDBOX/TEST Admin Session；不会向 UAT 或 PRODUCTION 请求数据。</p></div></section>}
    {supported && liveSession && <section className="lookup-panel compact digital-asset-filter"><input value={draftCustomer} maxLength={100} onChange={(event) => setDraftCustomer(event.target.value)} placeholder="可选：Customer ID；留空查看租户汇总" /><button disabled={!customerValid || visible.status === 'LOADING'} onClick={applyCustomer}><Search />应用范围</button>{!customerValid && <small>Customer ID 仅允许 2–100 位字母、数字、下划线或连字符。</small>}</section>}
    {visible.status === 'LOADING' && <section className="empty-state"><LoaderCircle className="spin" /><h3>正在核验 Digital Asset Funds</h3><p>不会读取本地缓存或 Lovable Mock。</p></section>}
    {visible.status === 'ERROR' && <div className="inline-error page-error" role="alert"><AlertTriangle />{visible.error}</div>}
    {visible.status === 'READY' && visible.value && <article className="panel"><div className="panel-title"><div><h3>Wallet Asset Summary</h3><p>{visible.value.customerId ? `Customer ${visible.value.customerId}` : 'Tenant aggregate'} · Current = posted + pending；available 与 hold 分列。</p></div><span className="record-count">{visible.value.assets.length} ASSETS</span></div>{visible.value.assets.length ? <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Accounts</th><th>Current</th><th>Posted</th><th>Pending</th><th>Hold</th><th>Available</th></tr></thead><tbody>{visible.value.assets.map((row) => <tr key={row.assetCode}><td>{row.assetCode}</td><td>{row.accountCount}</td><td>{row.currentBalance}</td><td>{row.postedBalance}</td><td>{row.pendingBalance}</td><td>{row.holdBalance}</td><td>{row.availableBalance}</td></tr>)}</tbody></table></div> : <div className="table-empty">当前作用域没有 Customer Wallet 资产；未生成替代记录。</div>}</article>}
  </section>
}
