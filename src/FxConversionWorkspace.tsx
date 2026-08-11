import { AlertTriangle, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, DEFAULT_API, productionApi, type AdminSession, type DataSource } from './productionApi'
import {
  FxConversionContractError,
  fxConversionScope,
  fxConversionSessionReadAllowed,
  type FxConversion,
  type FxConversionEnvironment,
} from './fxConversionContract'
import { acceptsMountedResponse, beginRequest, replaceRequestAbort } from './requestGeneration'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'

export type FxConversionClient = Readonly<{
  read: (
    token: string,
    tenantId: string,
    conversionId: string,
    environment: FxConversionEnvironment,
    signal: AbortSignal,
  ) => Promise<FxConversion>
}>
const defaultClient: FxConversionClient = Object.freeze({
  read: (token, tenantId, conversionId, environment, signal) =>
    productionApi.walletFxConversion(DEFAULT_API, token, tenantId, conversionId, environment, signal),
})
const conversionPattern = /^[A-Za-z0-9._:-]{2,128}$/
type View = Readonly<{ scope: string; status: 'IDLE' | 'LOADING' | 'READY' | 'ERROR'; value: FxConversion | null; error: string }>
const empty = (scope: string, status: View['status'] = 'IDLE'): View => Object.freeze({ scope, status, value: null, error: '' })
const safeError = (error: unknown): string => {
  if (error instanceof FxConversionContractError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Admin session is not authorized for this FX conversion'
    if (error.status === 404) return 'FX conversion was not found in the selected tenant scope'
    if (error.status === 408 || error.status === 0) return 'FX conversion detail is temporarily unavailable'
    return `FX conversion detail failed · HTTP ${error.status} · Trace ${error.traceId}`
  }
  return 'FX conversion response could not be verified'
}

export function FxConversionWorkspace({ session, tenantId, invalidateSession, client = defaultClient, now = Date.now }: {
  session: AdminSession
  tenantId: string
  invalidateSession: (expectedAccessToken: string) => void
  client?: FxConversionClient
  now?: () => number
}) {
  const environment = session.user.environment as DataSource
  const supported = environment === 'SANDBOX' || environment === 'TEST'
  const liveSession = fxConversionSessionReadAllowed(session, environment, now())
  const [draftId, setDraftId] = useState('')
  const [conversionId, setConversionId] = useState('')
  const validDraft = conversionPattern.test(draftId.trim())
  const tokenMarker = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenMarker.current || tokenMarker.current.token !== session.accessToken) tokenMarker.current = { token: session.accessToken, marker: crypto.randomUUID() }
  const scope = `${fxConversionScope(session, tenantId, environment, conversionId)}\u0000${tokenMarker.current.marker}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const lifecycle = useScopedRequestLifecycle(scope)
  const [view, setView] = useState<View>(() => empty(scope))
  const visible = view.scope === scope ? view : empty(scope)

  const load = useCallback(async () => {
    if (!conversionPattern.test(conversionId) || !supported || !fxConversionSessionReadAllowed(session, environment, now())) { setView(empty(scope)); return }
    const ticket = beginRequest(lifecycle.requestGate.current, scope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const token = session.accessToken
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentScope.current === scope
      && fxConversionSessionReadAllowed(session, environment, now())
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, scope)
    setView(empty(scope, 'LOADING'))
    try {
      const value = await client.read(token, tenantId, conversionId, environment as FxConversionEnvironment, controller.signal)
      if (isCurrent()) setView(Object.freeze({ scope, status: 'READY', value, error: '' }))
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof ApiError && error.status === 401) {
        invalidateSession(token)
        setView(empty(scope))
      } else setView(Object.freeze({ scope, status: 'ERROR', value: null, error: safeError(error) }))
    }
  }, [client, conversionId, environment, invalidateSession, lifecycle.mounted, lifecycle.requestAbort, lifecycle.requestGate, now, scope, session, supported, tenantId])

  useEffect(() => {
    setView(empty(scope))
    if (conversionId && supported && liveSession) void load()
  }, [conversionId, liveSession, load, scope, supported])

  const apply = () => {
    const next = draftId.trim()
    if (conversionPattern.test(next)) setConversionId(next)
  }
  return <section data-fx-conversion-workspace>
    <div className="page-head"><div><span>SYNTHETIC READ ONLY · {environment}</span><h2>FX Conversion Detail</h2><p>{tenantId} · 读取已落库的模拟兑换结果；不创建报价、不执行兑换。</p></div><button className="primary-btn" disabled={visible.status === 'LOADING' || !conversionId || !supported || !liveSession} onClick={() => void load()}><RefreshCw className={visible.status === 'LOADING' ? 'spin' : ''} />刷新兑换详情</button></div>
    {(!supported || !liveSession) && <section className="unavailable"><AlertTriangle /><div><h3>FX Detail Gate Closed</h3><p>只允许有效 SANDBOX/TEST Admin Session；不会向 UAT 或 PRODUCTION 请求数据。</p></div></section>}
    {supported && liveSession && <section className="lookup-panel compact"><input value={draftId} maxLength={128} onChange={(event) => setDraftId(event.target.value)} placeholder="真实 FX Conversion ID" /><button disabled={!validDraft || visible.status === 'LOADING'} onClick={apply}><Search />查询兑换</button>{draftId && !validDraft && <small>Conversion ID 仅允许 2–128 位字母、数字、点、冒号、下划线或连字符。</small>}</section>}
    {!conversionId && supported && liveSession && <section className="empty-state"><Search /><h3>CONVERSION ID REQUIRED</h3><p>输入真实 Conversion ID 后才会发起只读请求。</p></section>}
    {visible.status === 'LOADING' && <section className="empty-state"><LoaderCircle className="spin" /><h3>正在核验 FX Conversion</h3><p>不会调用真实外汇或第三方Provider。</p></section>}
    {visible.status === 'ERROR' && <div className="inline-error page-error" role="alert"><AlertTriangle />{visible.error}</div>}
    {visible.status === 'READY' && visible.value && <article className="panel"><div className="panel-title"><div><h3>{visible.value.sourceAssetCode} → {visible.value.targetAssetCode}</h3><p>{visible.value.id} · Quote {visible.value.quoteId}</p></div><span className="record-count">{visible.value.status}</span></div><div className="table-wrap"><table><thead><tr><th>Card</th><th>Source</th><th>Target</th><th>Rate</th><th>Created</th><th>Completed</th></tr></thead><tbody><tr><td>{visible.value.cardType} · {visible.value.cardId}</td><td>{visible.value.sourceAmount} {visible.value.sourceAssetCode}<br /><small>{visible.value.sourceWalletAccountId}</small></td><td>{visible.value.targetAmount} {visible.value.targetAssetCode}<br /><small>{visible.value.destinationWalletAccountId}</small></td><td>{visible.value.rate}</td><td>{visible.value.createdAt}</td><td>{visible.value.completedAt ?? '—'}</td></tr></tbody></table></div></article>}
  </section>
}
