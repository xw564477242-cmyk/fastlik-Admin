import { AlertTriangle, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  DEFAULT_API,
  productionApi,
  type AdminSession,
  type DataSource,
} from './productionApi'
import {
  ADMIN_WALLET_OPERATION_STATUSES,
  ADMIN_WALLET_OPERATION_TYPES,
  type AdminWalletOperationQuery,
} from './adminRoutes'
import {
  parseAdminWalletOperationPage,
  WALLET_OPERATION_PAGE_SIZE,
  walletOperationListScope,
  WalletOperationListContractError,
  walletOperationSessionReadAllowed,
  type AdminWalletOperationPage,
} from './walletOperationListContract'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from './requestGeneration'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'

type WalletEnvironment = Extract<DataSource, 'SANDBOX' | 'TEST'>

export type WalletAccountHistoryClient = Readonly<{
  list: (
    token: string,
    tenantId: string,
    accountId: string,
    environment: WalletEnvironment,
    query: AdminWalletOperationQuery,
    signal: AbortSignal,
  ) => Promise<string>
}>

const defaultClient: WalletAccountHistoryClient = Object.freeze({
  list: (token, tenantId, accountId, environment, query, signal) =>
    productionApi.walletAccountHistory(DEFAULT_API, token, tenantId, accountId, environment, query, signal),
})

type AccountHistoryView = Readonly<{
  scope: string
  busy: boolean
  loaded: boolean
  page: AdminWalletOperationPage | null
  error: string
}>

const emptyView = (scope: string, busy = false): AccountHistoryView => Object.freeze({
  scope,
  busy,
  loaded: false,
  page: null,
  error: '',
})
const accountPattern = /^[A-Za-z0-9._:-]{2,128}$/
const initialQuery = (): AdminWalletOperationQuery => Object.freeze({ limit: WALLET_OPERATION_PAGE_SIZE, offset: 0 })

const safeError = (error: unknown): string => {
  if (error instanceof WalletOperationListContractError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Admin session is not authorized for this account history'
    if (error.status === 404) return 'Wallet account was not found in the selected tenant scope'
    if (error.status === 408 || error.status === 0) return 'Wallet account history is temporarily unavailable'
    return `Wallet account history failed · HTTP ${error.status} · Trace ${error.traceId}`
  }
  return 'Wallet account history response could not be verified'
}

export function WalletAccountHistoryWorkspace({
  session,
  tenantId,
  invalidateSession,
  client = defaultClient,
  now = Date.now,
}: {
  session: AdminSession
  tenantId: string
  invalidateSession: (expectedAccessToken: string) => void
  client?: WalletAccountHistoryClient
  now?: () => number
}) {
  const environment = session.user.environment as DataSource
  const supportedEnvironment = environment === 'SANDBOX' || environment === 'TEST'
  const [draftAccountId, setDraftAccountId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [query, setQuery] = useState<AdminWalletOperationQuery>(initialQuery)
  const accountValid = accountPattern.test(draftAccountId.trim())
  const tokenScope = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenScope.current || tokenScope.current.token !== session.accessToken) {
    tokenScope.current = { token: session.accessToken, marker: crypto.randomUUID() }
  }
  const operationScope = walletOperationListScope(session.user.id, session.expiresAt, tenantId, environment, query, session.user.tenantId, session.user.roles, session.user.permissions)
  const baseScope = `${operationScope}\u0000${tokenScope.current.marker}\u0000${accountId}`
  const currentBaseScope = useRef(baseScope)
  currentBaseScope.current = baseScope
  const currentToken = useRef(session.accessToken)
  currentToken.current = session.accessToken
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [view, setView] = useState<AccountHistoryView>(() => emptyView(baseScope))
  const visible = view.scope === baseScope ? view : emptyView(baseScope)
  const sessionAllowed = walletOperationSessionReadAllowed(session, tenantId, environment, now())
  const queryValid = !query.assetCode || /^[A-Z0-9]{2,12}$/.test(query.assetCode)

  const load = useCallback(async () => {
    if (!accountPattern.test(accountId) || !queryValid || !supportedEnvironment || !walletOperationSessionReadAllowed(session, tenantId, environment, now())) {
      setView(emptyView(baseScope))
      return
    }
    const walletEnvironment = environment as WalletEnvironment
    const ticket = beginRequest(lifecycle.requestGate.current, baseScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const token = session.accessToken
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentToken.current === token
      && walletOperationSessionReadAllowed(session, tenantId, environment, now())
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, baseScope)
    setView(emptyView(baseScope, true))
    try {
      const raw = await client.list(token, tenantId, accountId, walletEnvironment, query, controller.signal)
      const page = parseAdminWalletOperationPage(raw, { tenantId, environment: walletEnvironment, query })
      if (isCurrent()) setView(Object.freeze({ scope: baseScope, busy: false, loaded: true, page, error: '' }))
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof ApiError && error.status === 401) {
        invalidateSession(token)
        setView(emptyView(baseScope))
      } else {
        setView(Object.freeze({ scope: baseScope, busy: false, loaded: true, page: null, error: safeError(error) }))
      }
    }
  }, [accountId, baseScope, client, environment, invalidateSession, lifecycle.mounted, lifecycle.requestAbort, lifecycle.requestGate, now, query, queryValid, session, supportedEnvironment, tenantId])

  useEffect(() => {
    setView(emptyView(baseScope))
    if (accountId && queryValid && supportedEnvironment && walletOperationSessionReadAllowed(session, tenantId, environment, now())) void load()
  }, [accountId, baseScope, environment, load, now, queryValid, session, supportedEnvironment, tenantId])

  const applyAccount = () => {
    const next = draftAccountId.trim()
    if (!accountPattern.test(next)) return
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setQuery(initialQuery())
    setAccountId(next)
  }
  const changeQuery = (patch: Partial<AdminWalletOperationQuery>) => {
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setView(emptyView(baseScope))
    setQuery((current) => Object.freeze({ ...current, ...patch, offset: 0 }))
  }
  const movePage = (offset: number) => {
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setView(emptyView(baseScope))
    setQuery((current) => Object.freeze({ ...current, offset }))
  }

  return <section data-wallet-account-history-workspace>
    <div className="page-head"><div><span>READ ONLY · {environment}</span><h2>Wallet Account History</h2><p>{tenantId} · 按真实 Account ID 核验费用、开卡、消费、提现、分润及资金流水。</p></div><button className="primary-btn" disabled={visible.busy || !accountId || !queryValid || !sessionAllowed || !supportedEnvironment} onClick={() => void load()}><RefreshCw className={visible.busy ? 'spin' : ''} />刷新账户历史</button></div>
    {(!supportedEnvironment || !sessionAllowed) && <section className="unavailable"><AlertTriangle /><div><h3>Account History Gate Closed</h3><p>只允许有效 SANDBOX/TEST Admin Session；不会向 UAT 或 PRODUCTION 请求数据。</p></div></section>}
    {supportedEnvironment && sessionAllowed && <>
      <section className="lookup-panel compact"><input value={draftAccountId} maxLength={128} onChange={(event) => setDraftAccountId(event.target.value)} placeholder="真实 Wallet Account ID" /><button disabled={!accountValid || visible.busy} onClick={applyAccount}><Search />查询账户</button>{draftAccountId && !accountValid && <small>Account ID 仅允许 2–128 位字母、数字、点、冒号、下划线或连字符。</small>}</section>
      <div className="wallet-operation-filters">
        <label>状态<select value={query.status ?? ''} onChange={(event) => changeQuery({ status: event.target.value ? event.target.value as AdminWalletOperationQuery['status'] : undefined })}><option value="">全部</option>{ADMIN_WALLET_OPERATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>类型<select value={query.type ?? ''} onChange={(event) => changeQuery({ type: event.target.value ? event.target.value as AdminWalletOperationQuery['type'] : undefined })}><option value="">全部</option>{ADMIN_WALLET_OPERATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>资产<input maxLength={12} value={query.assetCode ?? ''} onChange={(event) => changeQuery({ assetCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || undefined })} placeholder="USDT" />{!queryValid && <small>至少输入 2 个大写字母或数字</small>}</label>
      </div>
    </>}
    {!accountId && supportedEnvironment && sessionAllowed && <section className="empty-state"><Search /><h3>ACCOUNT ID REQUIRED</h3><p>输入真实 Wallet Account ID 后才会向 Backend DEV 发起只读请求。</p></section>}
    {visible.busy && <section className="empty-state"><LoaderCircle className="spin" /><h3>正在核验 Account History</h3><p>切换账户、租户、环境或会话会立即中止旧请求。</p></section>}
    {visible.error && <div className="inline-error page-error" role="alert"><AlertTriangle />{visible.error}</div>}
    {!visible.busy && visible.loaded && visible.page && <article className="panel wallet-operation-results"><div className="panel-title"><div><h3>Verified account operations</h3><p>{accountId} · 只显示冻结 OpenAPI 的安全运营字段。</p></div><span className="record-count">{visible.page.total} TOTAL</span></div>{visible.page.operations.length ? <div className="table-wrap"><table><thead><tr><th>Created</th><th>ID</th><th>Type</th><th>Status</th><th>Asset</th><th>Amount</th><th>Source</th><th>Destination</th></tr></thead><tbody>{visible.page.operations.map((operation) => <tr key={operation.id}><td>{operation.createdAt}</td><td title={operation.id}>{operation.id}</td><td>{operation.type}</td><td>{operation.status}</td><td>{operation.assetCode}</td><td>{operation.amount}</td><td title={operation.sourceAccountId ?? ''}>{operation.sourceAccountId ?? '—'}</td><td title={operation.destinationAccountId ?? ''}>{operation.destinationAccountId ?? '—'}</td></tr>)}</tbody></table></div> : <div className="table-empty"><Search />该账户在当前筛选范围没有 Wallet Operation；未生成替代记录。</div>}<div className="wallet-operation-pagination"><button disabled={visible.page.offset === 0} onClick={() => movePage(Math.max(0, visible.page!.offset - visible.page!.limit))}>上一页</button><span>{visible.page.operations.length ? `${visible.page.offset + 1}–${visible.page.offset + visible.page.operations.length}` : '0'} / {visible.page.total}</span><button disabled={!visible.page.hasMore} onClick={() => movePage(visible.page!.offset + visible.page!.limit)}>下一页</button></div></article>}
  </section>
}
