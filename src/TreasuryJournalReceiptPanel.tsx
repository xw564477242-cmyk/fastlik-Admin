import { AlertTriangle, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_API, productionApi, type AdminSession } from './productionApi'
import {
  parseTreasuryFundsInstructionReceipt,
  treasuryFundsBaseScope,
  treasuryFundsFailurePolicy,
  TreasuryFundsInstructionContractError,
  treasuryFundsLookupScope,
  treasuryFundsSessionReadAllowed,
  type TreasuryFundsEnvironment,
  type TreasuryFundsInstructionReceipt,
} from './treasuryFundsInstructionContract'
import {
  abortCurrentRequest,
  acceptsMountedResponse,
  beginRequest,
  invalidateRequests,
  replaceRequestAbort,
} from './requestGeneration'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'

export type TreasuryFundsInstructionReader = (
  base: string,
  token: string,
  tenantId: string,
  operationId: string,
  environment: TreasuryFundsEnvironment,
  signal: AbortSignal,
) => Promise<string>

type Props = Readonly<{
  session: AdminSession
  tenantId: string
  runtimeEnvironment: string | undefined
  reader?: TreasuryFundsInstructionReader
  invalidateSession: (expectedAccessToken: string) => void
  now?: () => number
}>

type Snapshot = Readonly<{ scope: string; value: TreasuryFundsInstructionReceipt }>

const defaultReader: TreasuryFundsInstructionReader = (base, token, tenantId, operationId, environment, signal) =>
  productionApi.treasuryFundsInstruction(base, token, tenantId, operationId, environment, signal)

export function TreasuryJournalReceiptPanel({
  session,
  tenantId,
  runtimeEnvironment,
  reader = defaultReader,
  invalidateSession,
  now = Date.now,
}: Props) {
  const [lookup, setLookup] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sessionIdentity = useRef<{ session: AdminSession; marker: string } | null>(null)
  if (!sessionIdentity.current || sessionIdentity.current.session !== session) {
    sessionIdentity.current = { session, marker: crypto.randomUUID() }
  }
  const identityScope = treasuryFundsBaseScope(session, runtimeEnvironment, tenantId, now())
  const baseScope = `${identityScope ?? 'TREASURY_FUNDS_BLOCKED'}\u0000${sessionIdentity.current.marker}`
  const contractLookupScope = treasuryFundsLookupScope(identityScope, lookup.trim())
  const requestScope = contractLookupScope ? `${contractLookupScope}\u0000${sessionIdentity.current.marker}` : null
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const currentBaseScope = useRef(baseScope)
  const currentRequestScope = useRef(requestScope)
  const currentToken = useRef(session.accessToken)
  const invalidateSessionRef = useRef(invalidateSession)
  currentBaseScope.current = baseScope
  currentRequestScope.current = requestScope
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

  const readReceipt = async () => {
    const operationId = lookup.trim()
    const lookupScope = treasuryFundsLookupScope(identityScope, operationId)
    const capturedScope = lookupScope ? `${lookupScope}\u0000${sessionIdentity.current?.marker ?? ''}` : null
    if (
      !capturedScope
      || capturedScope !== currentRequestScope.current
      || !treasuryFundsSessionReadAllowed(session, runtimeEnvironment, tenantId, now())
      || (runtimeEnvironment !== 'SANDBOX' && runtimeEnvironment !== 'TEST')
    ) {
      abortCurrentRequest(lifecycle.requestAbort)
      invalidateRequests(lifecycle.requestGate.current)
      setSnapshot(null)
      setBusy(false)
      setError('请输入有效 operationId，并使用当前已授权的 SANDBOX 或 TEST 管理员会话。')
      return
    }
    const environment = runtimeEnvironment
    const capturedToken = session.accessToken
    const ticket = beginRequest(lifecycle.requestGate.current, capturedScope)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const isCurrent = () => lifecycle.requestAbort.current === controller
      && currentBaseScope.current === baseScope
      && currentRequestScope.current === capturedScope
      && currentToken.current === capturedToken
      && treasuryFundsSessionReadAllowed(session, runtimeEnvironment, tenantId, now())
      && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, capturedScope)
    setBusy(true)
    setError('')
    try {
      const raw = await reader(DEFAULT_API, capturedToken, tenantId, operationId, environment, controller.signal)
      const value = parseTreasuryFundsInstructionReceipt(raw, operationId)
      if (isCurrent()) setSnapshot(Object.freeze({ scope: capturedScope, value }))
    } catch (reason) {
      if (isCurrent()) {
        const policy = treasuryFundsFailurePolicy(reason)
        const contractFailure = reason instanceof TreasuryFundsInstructionContractError
        if (policy.clearSnapshot || contractFailure) setSnapshot(null)
        if (contractFailure) setError(reason.message)
        else if (policy.status === 401 || policy.status === 403) setError('当前管理员会话或 Treasury 读取权限已失效；旧回执已清除。')
        else if (policy.status === 404) setError('当前租户与环境中不存在该 Treasury operation。')
        else setError('Treasury 回执暂时无法读取；同一作用域最近一次已核验快照保持不变。')
        if (policy.invalidateSession) invalidateSessionRef.current(capturedToken)
      }
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  const visible = snapshot?.scope === requestScope ? snapshot.value : null
  const allowed = identityScope !== null && requestScope !== null
  return <section data-treasury-panel="journal-receipt">
    <section className="lookup-panel">
      <div><span>EXACT READ ONLY · NO MUTATION</span><h3>Treasury Instruction / Journal Receipt</h3><p>输入已存在的 operationId，只读取一条两分录回执；这不是 Journal history，也不提供资金指令、调账或清算操作。</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void readReceipt() }}>
        <input value={lookup} onChange={(event) => changeLookup(event.target.value)} placeholder="真实 Treasury operationId" />
        <button type="submit" data-treasury-action="receipt-read" disabled={!allowed}><Search />{busy ? '重新核验' : '查询只读回执'}</button>
      </form>
    </section>
    {!identityScope && <div className="inline-error page-error"><AlertTriangle />Treasury 回执只允许当前 SANDBOX/TEST 租户中具备 admin:read 的有效会话；未发送请求。</div>}
    {error && <div className="inline-error page-error"><AlertTriangle />{error}</div>}
    {busy && !visible && <section className="empty-state treasury-loading"><LoaderCircle className="spin" /><h3>正在核验只读 Treasury 回执</h3><p>不会请求列表、原始账户标识或生产环境。</p></section>}
    {busy && visible && <p className="card-action-note">正在重新核验；完成前保留同一 operation 作用域最近一次已验证快照。</p>}
    {visible && <article className="panel card-contract-panel">
      <div className="panel-title"><div><h3>Funds Instruction Receipt</h3><p>{runtimeEnvironment} · exact immutable detail</p></div><span className="treasury-status pass">{visible.status}</span></div>
      <div className="record-list">
        <p><span>Instruction</span><b>{visible.instructionId}</b></p>
        <p><span>Operation</span><b>{visible.operationId}</b></p>
        <p><span>Direction</span><b>{visible.direction}</b></p>
        <p><span>Asset / amount minor</span><b>{visible.assetCode} · {visible.amountMinor}</b></p>
        <p><span>Completed</span><b>{visible.completedAt}</b></p>
        <p><span>Treasury available minor</span><b>{visible.treasury.availableBalanceMinor}</b></p>
        <p><span>Treasury version</span><b>{visible.treasury.version}</b></p>
        <p><span>Journal</span><b>{visible.journal.id} · {visible.journal.status}</b></p>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Account role</th><th>Side</th><th>Asset</th><th>Amount minor</th></tr></thead><tbody>{visible.journal.entries.map((entry) => <tr key={entry.accountRole}><td>{entry.accountRole}</td><td>{entry.side}</td><td>{entry.assetCode}</td><td>{entry.amountMinor}</td></tr>)}</tbody></table></div>
      <div className="treasury-clear"><ShieldCheck />Audit recorded · immutable read receipt</div>
    </article>}
  </section>
}
