import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import {
  adminKycBaseScope,
  adminKycFailurePolicy,
  adminKycLookupScope,
  adminKycSessionReadAllowed,
  type AdminKycEnvironment,
  type AdminKycRecord,
  type AdminKycSession,
} from './adminKycContract'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from './requestGeneration'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'

export type AdminKycReader = (
  base: string,
  key: string,
  tenantId: string,
  environment: AdminKycEnvironment,
  userId: string,
  signal: AbortSignal,
) => Promise<AdminKycRecord>

type Props = Readonly<{
  session: AdminKycSession
  tenantId: string
  runtimeEnvironment: string | undefined
  readKyc: AdminKycReader
  invalidateSession: (expectedAccessToken: string) => void
}>

type Snapshot = Readonly<{ scope: string; value: AdminKycRecord }>

export function AdminKycPanel({ session, tenantId, runtimeEnvironment, readKyc, invalidateSession }: Props) {
  const [lookup, setLookup] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const tokenIdentity = useRef<{ token: string; marker: string } | null>(null)
  if (!tokenIdentity.current || tokenIdentity.current.token !== session.accessToken) {
    tokenIdentity.current = { token: session.accessToken, marker: crypto.randomUUID() }
  }
  const identityScope = adminKycBaseScope(session, runtimeEnvironment, tenantId, 'user')
  const baseScope = `${identityScope ?? 'ADMIN_KYC_BLOCKED'}\u0000${tokenIdentity.current.marker}`
  const lookupScope = adminKycLookupScope(identityScope, lookup.trim())
  const currentRequestScope = lookupScope ? `${lookupScope}\u0000${tokenIdentity.current.marker}` : null
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const currentBaseScope = useRef(baseScope)
  const currentLookupScope = useRef(currentRequestScope)
  const currentToken = useRef(session.accessToken)
  const invalidateSessionRef = useRef(invalidateSession)
  currentBaseScope.current = baseScope
  currentLookupScope.current = currentRequestScope
  currentToken.current = session.accessToken
  invalidateSessionRef.current = invalidateSession

  useEffect(() => {
    setLookup('')
    setSnapshot(null)
    setBusy(false)
    setError('')
  }, [baseScope])

  const changeLookup = (next: string) => {
    abortCurrentRequest(lifecycle.requestAbort)
    invalidateRequests(lifecycle.requestGate.current)
    setLookup(next)
    setSnapshot(null)
    setBusy(false)
    setError('')
  }

  const refresh = async () => {
    const userId = lookup.trim()
    const contractScope = adminKycLookupScope(identityScope, userId)
    const requestScope = contractScope ? `${contractScope}\u0000${tokenIdentity.current?.marker ?? ''}` : null
    if (
      !requestScope
      || requestScope !== currentLookupScope.current
      || !adminKycSessionReadAllowed(session, runtimeEnvironment, tenantId, 'user')
      || (session.user.environment !== 'SANDBOX' && session.user.environment !== 'TEST')
    ) {
      abortCurrentRequest(lifecycle.requestAbort)
      invalidateRequests(lifecycle.requestGate.current)
      setSnapshot(null)
      setBusy(false)
      setError('KYC 查询仅适用于当前已验证的 SANDBOX 或 TEST 管理员会话。')
      return
    }
    const environment = session.user.environment
    const capturedToken = session.accessToken
    const ticket = beginRequest(lifecycle.requestGate.current, requestScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentLookupScope.current === requestScope
      && currentToken.current === capturedToken
      && adminKycSessionReadAllowed(session, runtimeEnvironment, tenantId, 'user')
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, requestScope)
    setBusy(true)
    setError('')
    try {
      const value = await readKyc('/api', capturedToken, tenantId, environment, userId, controller.signal)
      if (isCurrent()) setSnapshot(Object.freeze({ scope: requestScope, value }))
    } catch (reason) {
      if (isCurrent()) {
        const policy = adminKycFailurePolicy(reason)
        if (policy.clearSnapshot) setSnapshot(null)
        setError(policy.clearSnapshot
          ? '当前管理员会话、权限或用户作用域已失效；旧 KYC 数据已清除。'
          : 'KYC 状态暂时无法读取；当前用户最近一次已验证快照保持不变。')
        if (policy.invalidateSession) invalidateSessionRef.current(capturedToken)
      }
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  const visible = snapshot?.scope === currentRequestScope ? snapshot.value : null
  const allowed = identityScope !== null && currentRequestScope !== null
  return <>
    <section className="lookup-panel">
      <div><span>EXACT READ-ONLY KYC</span><h3>用户 KYC 状态</h3><p>只显示 userId、status、reviewedAt；不会显示姓名、邮箱、Provider 引用或 Wallet 数据。</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void refresh() }}>
        <input value={lookup} onChange={(event) => changeLookup(event.target.value)} placeholder="真实 User ID" />
        <button disabled={!allowed}><Search />{busy ? '重新查询' : '查询 KYC'}</button>
      </form>
    </section>
    {!identityScope && <div className="inline-error page-error"><AlertTriangle />KYC 查询在当前环境或管理员会话中不可用，未发送请求。</div>}
    {error && <div className="inline-error page-error"><AlertTriangle />{error}</div>}
    {busy && visible && <p className="card-action-note">正在重新查询；完成前保留同一作用域最近一次已验证快照。</p>}
    {visible && <article className="panel card-contract-panel">
      <div className="panel-title"><div><h3>User KYC</h3><p>{runtimeEnvironment} · exact read-only contract</p></div><span className="record-count">EXACT 3 FIELDS</span></div>
      <div className="record-list">
        <p><span>User ID</span><b>{visible.userId}</b></p>
        <p><span>Status</span><b>{visible.status}</b></p>
        <p><span>Reviewed</span><b>{visible.reviewedAt ? new Date(visible.reviewedAt).toLocaleString() : 'Not reviewed'}</b></p>
      </div>
    </article>}
  </>
}
