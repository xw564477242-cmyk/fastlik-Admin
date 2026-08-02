import { AlertTriangle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ADMIN_WALLET_TRANSACTION_PAGE_SIZE,
  ADMIN_WALLET_TRANSACTION_STATUSES,
  ADMIN_WALLET_TRANSACTION_TYPES,
  adminWalletTransactionScope,
  loadAdminWalletTransactions,
  type AdminWalletTransactionQuery,
  type AdminWalletTransactionSnapshot,
  type AdminWalletTransactionTransport,
} from './adminWalletTransactionContract'
import { adminWalletTransactionHttpTransport } from './adminWalletTransactionClient'
import type { AdminSession } from './productionApi'
import {
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from './requestGeneration'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'

type View = Readonly<{
  scope: string
  busy: boolean
  snapshot: AdminWalletTransactionSnapshot | null
  error: string
}>
const emptyView = (scope: string): View => Object.freeze({ scope, busy: false, snapshot: null, error: '' })
const initialQuery = (): AdminWalletTransactionQuery => Object.freeze({
  limit: ADMIN_WALLET_TRANSACTION_PAGE_SIZE,
  offset: 0,
})

export function WalletTransactionsWorkspace({
  session,
  tenantId,
  client = adminWalletTransactionHttpTransport,
  onUnauthorized,
  now = Date.now,
}: {
  session: AdminSession
  tenantId: string
  client?: AdminWalletTransactionTransport
  onUnauthorized: () => void
  now?: () => number
}) {
  const [query, setQuery] = useState<AdminWalletTransactionQuery>(initialQuery)
  const tokenMarker = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenMarker.current || tokenMarker.current.token !== session.accessToken) {
    tokenMarker.current = { token: session.accessToken, marker: crypto.randomUUID() }
  }
  let requestScope = ''
  try { requestScope = adminWalletTransactionScope(session, tenantId, query, now()) } catch { requestScope = '' }
  const baseScope = `${requestScope || 'INVALID_ADMIN_WALLET_TRANSACTION_SCOPE'}\u0000${tokenMarker.current.marker}`
  const currentScope = useRef(baseScope)
  currentScope.current = baseScope
  const currentToken = useRef(session.accessToken)
  currentToken.current = session.accessToken
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [view, setView] = useState<View>(() => emptyView(baseScope))
  const visible = view.scope === baseScope ? view : emptyView(baseScope)
  const supported = requestScope.length > 0

  const load = useCallback(async (requestedQuery = query, previous = visible.snapshot) => {
    let scope = ''
    try { scope = adminWalletTransactionScope(session, tenantId, requestedQuery, now()) } catch { setView(emptyView(baseScope)); return }
    if (!scope || `${scope}\u0000${tokenMarker.current?.marker ?? ''}` !== baseScope) return
    const ticket = beginRequest(lifecycle.requestGate.current, baseScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentScope.current === baseScope
      && currentToken.current === session.accessToken
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, baseScope)
    setView(Object.freeze({ scope: baseScope, busy: true, snapshot: previous, error: '' }))
    try {
      const result = await loadAdminWalletTransactions(client, session, tenantId, requestedQuery, previous, controller.signal, now)
      if (!isCurrent()) return
      if (result.exitSession) {
        invalidateRequests(lifecycle.requestGate.current)
        lifecycle.requestAbort.current = null
        setView(emptyView(baseScope))
        onUnauthorized()
        return
      }
      setView(Object.freeze({ scope: baseScope, busy: false, snapshot: result.snapshot, error: result.error }))
      lifecycle.requestAbort.current = null
    } catch {
      // Cancellation, scope changes and unmounts deliberately perform zero writes.
    }
  }, [baseScope, client, lifecycle.mounted, lifecycle.requestAbort, lifecycle.requestGate, now, onUnauthorized, query, session, tenantId, visible.snapshot])

  useEffect(() => {
    setView(emptyView(baseScope))
    if (supported) void load(query, null)
  }, [baseScope]) // eslint-disable-line react-hooks/exhaustive-deps

  const changeFilters = (patch: Partial<AdminWalletTransactionQuery>) => {
    lifecycle.requestAbort.current?.abort()
    invalidateRequests(lifecycle.requestGate.current)
    setView(emptyView(baseScope))
    setQuery((current) => Object.freeze({ ...current, ...patch, offset: 0 }))
  }
  const movePage = (offset: number) => {
    lifecycle.requestAbort.current?.abort()
    invalidateRequests(lifecycle.requestGate.current)
    setView(emptyView(baseScope))
    setQuery((current) => Object.freeze({ ...current, offset }))
  }
  const page = visible.snapshot?.page ?? null

  return <section data-admin-wallet-transactions>
    <div className="page-head"><div><span>READ ONLY · {session.user.environment}</span><h2>Wallet Transactions</h2><p>{tenantId} · Backend 精确 14 字段交易合同；分页、筛选、管理员和环境均绑定当前会话。</p></div><button className="primary-btn" disabled={!supported || visible.busy} onClick={() => void load()}><RefreshCw className={visible.busy ? 'spin' : ''} />刷新交易</button></div>
    {!supported && <section className="unavailable"><AlertTriangle /><div><h3>Admin Wallet Transaction Gate Closed</h3><p>仅允许当前租户的 SANDBOX/TEST 有效管理员会话；不会向 UAT 或 PRODUCTION 发出请求。</p></div></section>}
    {supported && <div className="card-transaction-filters">
      <label>状态<select value={query.status ?? ''} disabled={visible.busy} onChange={(event) => changeFilters({ status: event.target.value ? event.target.value as AdminWalletTransactionQuery['status'] : undefined })}><option value="">全部</option>{ADMIN_WALLET_TRANSACTION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label>类型<select value={query.type ?? ''} disabled={visible.busy} onChange={(event) => changeFilters({ type: event.target.value ? event.target.value as AdminWalletTransactionQuery['type'] : undefined })}><option value="">全部</option>{ADMIN_WALLET_TRANSACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label>资产<input maxLength={12} value={query.assetCode ?? ''} disabled={visible.busy} onChange={(event) => changeFilters({ assetCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || undefined })} placeholder="USD" /></label>
    </div>}
    {visible.error && <div className="inline-error page-error" role="alert"><AlertTriangle />{visible.error}{page ? ' · 已保留同一作用域的已验证快照。' : ''}</div>}
    {visible.busy && <p>正在核验当前交易页…</p>}
    {!visible.busy && page && <article className="panel"><div className="panel-title"><div><h3>Verified Wallet Transactions</h3><p>严格消费 Backend 14 个公开 Admin 字段；不接受 customer、Provider 或任意额外字段。</p></div><span className="record-count">{page.total} TOTAL</span></div>{page.items.length ? <div className="table-wrap"><table><thead><tr><th>Created</th><th>ID</th><th>Account</th><th>Type</th><th>Status</th><th>Asset</th><th>Amount</th><th>Reference</th></tr></thead><tbody>{page.items.map((item) => <tr key={item.id}><td>{item.createdAt}</td><td>{item.id}</td><td>{item.walletAccountId}</td><td>{item.type}</td><td>{item.status}</td><td>{item.assetCode}</td><td>{item.amount}</td><td>{item.referenceType} · {item.referenceId}</td></tr>)}</tbody></table></div> : <div className="table-empty"><Search />当前筛选页没有交易。</div>}<div className="wallet-operation-pagination"><button disabled={visible.busy || page.offset === 0} onClick={() => movePage(Math.max(0, page.offset - page.limit))}>上一页</button><span>{page.items.length ? `${page.offset + 1}–${page.offset + page.items.length}` : '0'} / {page.total}</span><button disabled={visible.busy || !page.hasMore} onClick={() => movePage(page.offset + page.limit)}>下一页</button></div></article>}
  </section>
}
