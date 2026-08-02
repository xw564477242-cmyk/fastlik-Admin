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

export type WalletOperationsClient = Readonly<{
  list: (
    token: string,
    tenantId: string,
    environment: WalletEnvironment,
    query: AdminWalletOperationQuery,
    signal: AbortSignal,
  ) => Promise<string>
}>

const defaultClient: WalletOperationsClient = Object.freeze({
  list: (token, tenantId, environment, query, signal) =>
    productionApi.walletOperations(DEFAULT_API, token, tenantId, environment, query, signal),
})

type WalletOperationView = Readonly<{
  scope: string
  busy: boolean
  loaded: boolean
  page: AdminWalletOperationPage | null
  error: string
}>

const emptyView = (scope: string, busy = false): WalletOperationView => Object.freeze({
  scope,
  busy,
  loaded: false,
  page: null,
  error: '',
})

const safeError = (error: unknown): string => {
  if (error instanceof WalletOperationListContractError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Admin session is not authorized for this Wallet read'
    if (error.status === 404) return 'Wallet operations were not found in the selected scope'
    if (error.status === 408 || error.status === 0) return 'Wallet operation read is temporarily unavailable'
    if (error.status === 499) return 'Wallet operation read was cancelled after the scope changed'
    return 'Wallet operation read failed'
  }
  return 'Wallet operation response could not be verified'
}

const initialQuery = (): AdminWalletOperationQuery => Object.freeze({
  limit: WALLET_OPERATION_PAGE_SIZE,
  offset: 0,
})

export function WalletOperationsWorkspace({
  session,
  tenantId,
  client = defaultClient,
  now = Date.now,
}: {
  session: AdminSession
  tenantId: string
  client?: WalletOperationsClient
  now?: () => number
}) {
  const environment = session.user.environment as DataSource
  const supportedEnvironment = environment === 'SANDBOX' || environment === 'TEST'
  const [query, setQuery] = useState<AdminWalletOperationQuery>(initialQuery)
  const tokenScope = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenScope.current || tokenScope.current.token !== session.accessToken) {
    tokenScope.current = { token: session.accessToken, marker: crypto.randomUUID() }
  }
  const baseScope = `${walletOperationListScope(session.user.id, session.expiresAt, tenantId, environment, query, session.user.tenantId, session.user.roles, session.user.permissions)}\u0000${tokenScope.current.marker}`
  const currentBaseScope = useRef(baseScope)
  currentBaseScope.current = baseScope
  const currentToken = useRef(session.accessToken)
  currentToken.current = session.accessToken
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [view, setView] = useState<WalletOperationView>(() => emptyView(baseScope))
  const visible = view.scope === baseScope ? view : emptyView(baseScope)
  const sessionAllowed = walletOperationSessionReadAllowed(session, tenantId, environment, now())
  const queryValid = !query.assetCode || /^[A-Z0-9]{2,12}$/.test(query.assetCode)

  const load = useCallback(async () => {
    if (!queryValid || !supportedEnvironment || !walletOperationSessionReadAllowed(session, tenantId, environment, now())) {
      setView(emptyView(baseScope))
      return
    }
    const walletEnvironment = environment as WalletEnvironment
    const ticket = beginRequest(lifecycle.requestGate.current, baseScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentToken.current === session.accessToken
      && walletOperationSessionReadAllowed(session, tenantId, environment, now())
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, baseScope)
    setView(emptyView(baseScope, true))
    try {
      const raw = await client.list(session.accessToken, tenantId, walletEnvironment, query, controller.signal)
      const page = parseAdminWalletOperationPage(raw, { tenantId, environment: walletEnvironment, query })
      if (isCurrent()) setView(Object.freeze({ scope: baseScope, busy: false, loaded: true, page, error: '' }))
    } catch (error) {
      if (isCurrent()) setView(Object.freeze({ scope: baseScope, busy: false, loaded: true, page: null, error: safeError(error) }))
    }
  }, [baseScope, client, environment, lifecycle.mounted, lifecycle.requestAbort, lifecycle.requestGate, now, query, queryValid, session, supportedEnvironment, tenantId])

  useEffect(() => {
    setView(emptyView(baseScope))
    if (queryValid && supportedEnvironment && walletOperationSessionReadAllowed(session, tenantId, environment, now())) void load()
  }, [baseScope, environment, load, now, queryValid, session, supportedEnvironment, tenantId])

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

  return <section data-wallet-operation-workspace>
    <div className="page-head"><div><span>READ ONLY · {environment}</span><h2>Wallet Operations</h2><p>{tenantId} · Backend dev 合同状态/类型/资产筛选；切换会话、范围或筛选会中止旧请求并隐藏旧快照。</p></div><button className="primary-btn" disabled={visible.busy || !queryValid || !sessionAllowed || !supportedEnvironment} onClick={() => void load()}><RefreshCw className={visible.busy ? 'spin' : ''} />刷新只读记录</button></div>
    {!supportedEnvironment && <section className="unavailable" data-wallet-operation-blocked="environment"><AlertTriangle /><div><h3>Environment Gate Closed</h3><p>本工作区只允许 SANDBOX 与 TEST；不会向 UAT 或 PRODUCTION 发出请求。</p></div></section>}
    {supportedEnvironment && !sessionAllowed && <section className="unavailable" data-wallet-operation-blocked="session"><AlertTriangle /><div><h3>Admin Session Scope Invalid</h3><p>会话已过期或身份作用域无效；旧请求完成不会写入页面。</p></div></section>}
    {supportedEnvironment && sessionAllowed && <div className="wallet-operation-filters">
      <label>状态<select value={query.status ?? ''} onChange={(event) => changeQuery({ status: event.target.value ? event.target.value as AdminWalletOperationQuery['status'] : undefined })}><option value="">全部</option>{ADMIN_WALLET_OPERATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label>类型<select value={query.type ?? ''} onChange={(event) => changeQuery({ type: event.target.value ? event.target.value as AdminWalletOperationQuery['type'] : undefined })}><option value="">全部</option>{ADMIN_WALLET_OPERATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label>资产<input maxLength={12} value={query.assetCode ?? ''} onChange={(event) => changeQuery({ assetCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || undefined })} placeholder="USDT" />{!queryValid && <small>至少输入 2 个大写字母或数字</small>}</label>
    </div>}
    {visible.busy && <section className="empty-state wallet-operation-loading"><LoaderCircle className="spin" /><h3>正在核验 Wallet Operations</h3><p>只读取当前 Admin、租户、环境与筛选作用域。</p></section>}
    {visible.error && <div className="inline-error page-error" role="alert"><AlertTriangle />{visible.error}</div>}
    {!visible.busy && visible.loaded && visible.page && <article className="panel wallet-operation-results"><div className="panel-title"><div><h3>Verified operation records</h3><p>只显示公开运营字段；idempotency、外部引用、失败原因与 journal IDs 不进入页面。</p></div><span className="record-count">{visible.page.total} TOTAL</span></div>{visible.page.operations.length ? <div className="table-wrap"><table><thead><tr><th>Created</th><th>ID</th><th>Type</th><th>Status</th><th>Asset</th><th>Amount</th><th>Source</th><th>Destination</th></tr></thead><tbody>{visible.page.operations.map((operation) => <tr key={operation.id}><td>{operation.createdAt}</td><td title={operation.id}>{operation.id}</td><td>{operation.type}</td><td>{operation.status}</td><td>{operation.assetCode}</td><td>{operation.amount}</td><td title={operation.sourceAccountId ?? ''}>{operation.sourceAccountId ?? '—'}</td><td title={operation.destinationAccountId ?? ''}>{operation.destinationAccountId ?? '—'}</td></tr>)}</tbody></table></div> : <div className="table-empty"><Search />当前筛选作用域没有 Wallet Operation；未生成替代记录。</div>}<div className="wallet-operation-pagination"><button disabled={visible.busy || visible.page.offset === 0} onClick={() => movePage(Math.max(0, visible.page!.offset - visible.page!.limit))}>上一页</button><span>{visible.page.operations.length ? `${visible.page.offset + 1}–${visible.page.offset + visible.page.operations.length}` : '0'} / {visible.page.total}</span><button disabled={visible.busy || !visible.page.hasMore} onClick={() => movePage(visible.page!.offset + visible.page!.limit)}>下一页</button></div></article>}
  </section>
}
