import { useEffect, useRef, useState } from 'react'
import { productionApi, DEFAULT_API, ApiError, type AdminSession } from './productionApi'
import { runtimeConfig } from './runtimeConfig'
import { BuildIdentityLabel } from './BuildIdentityLabel'
import { adminCardSnapshotSessionScope, parseCardWorkspaceResponse, type CardWorkspaceView } from './cardWorkspaceContract'
import { useScopedRequestLifecycle } from './useScopedRequestLifecycle'
import { acceptsMountedResponse, beginRequest, replaceRequestAbort } from './requestGeneration'
import { parseSupportReference, parseSupportAudit, localDisposition, type SupportAudit } from './launchReadOnlyContract'
import { SupportCasePanel } from './SupportCasePanel'

export function LaunchReadOnlyAdmin({session, onLogout, invalidateSession}: {session: AdminSession; onLogout: () => void; invalidateSession: (token: string) => void}) {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      const remaining = Date.parse(session.expiresAt) - Date.now()
      if (!Number.isFinite(remaining) || remaining <= 0) { invalidateSession(session.accessToken); return }
      timeout = setTimeout(schedule, Math.min(remaining, 2_147_483_647))
    }
    schedule()
    return () => clearTimeout(timeout)
  }, [session.expiresAt, session.accessToken, invalidateSession])
  const scope = adminCardSnapshotSessionScope(session.user.id, session.expiresAt, session.user.tenantId, session.user.tenantId, session.user.environment, runtimeConfig.environment, session.accessToken)
  const permitted = session.user.permissions.some((p) => ['*', 'admin:*', 'admin:read'].includes(p))
  const baseScope = permitted && scope ? scope : 'blocked'
  const liveScope = useRef(baseScope); liveScope.current = baseScope
  const lifecycle = useScopedRequestLifecycle(baseScope)
  const [inputs, setInputs] = useState({scope: baseScope, cardId: '', reference: ''})
  const cardId = inputs.scope === baseScope ? inputs.cardId : ''
  const reference = inputs.scope === baseScope ? inputs.reference : ''
  const setCardId = (value: string) => setInputs({scope: baseScope, cardId: value, reference})
  const setReference = (value: string) => setInputs({scope: baseScope, cardId, reference: value})
  const [state, setState] = useState<{scope: string; busy: boolean; error: string; card: CardWorkspaceView | null; audit: SupportAudit | null}>({scope: baseScope, busy: false, error: '', card: null, audit: null})
  const [disposition, setDisposition] = useState('ESCALATED')
  const view = state.scope === baseScope ? state : {busy: false, error: '', card: null, audit: null}
  const lookup = async (kind: 'card' | 'audit') => {
    if (baseScope === 'blocked' || view.busy) return
    const captured = baseScope
    const ticket = beginRequest(lifecycle.requestGate.current, captured)
    const controller = replaceRequestAbort(lifecycle.requestAbort)
    const current = () => liveScope.current === captured && acceptsMountedResponse(lifecycle.mounted.current, lifecycle.requestGate.current, ticket, captured) && Date.parse(session.expiresAt) > Date.now()
    setState({scope: captured, busy: true, error: '', card: null, audit: null})
    try {
      if (kind === 'card') {
        const id = cardId.trim()
        if (!/^[A-Za-z0-9._:-]{2,128}$/.test(id)) throw new Error('请输入有效卡ID')
        const wire = await productionApi.cardSnapshot(DEFAULT_API, session.accessToken, session.user.tenantId, id, controller.signal)
        const card = parseCardWorkspaceResponse('read', wire, id, session.user.environment as 'SANDBOX' | 'TEST')
        if (current()) setState({scope: captured, busy: false, error: '', card, audit: null})
      } else {
        const expected = parseSupportReference(reference, session.user.tenantId, session.user.environment)
        const wire = await productionApi.cardSupportAudit(DEFAULT_API, session.accessToken, expected.tenantId, expected.traceId, controller.signal)
        const audit = parseSupportAudit(wire, expected)
        if (current()) setState({scope: captured, busy: false, error: '', card: null, audit})
      }
    } catch (error) {
      if (!current()) return
      if (error instanceof ApiError && error.status === 401) invalidateSession(session.accessToken)
      const trace = error instanceof ApiError && /^[A-Za-z0-9._:-]{8,128}$/.test(error.traceId) ? error.traceId : 'unavailable'
      const message = error instanceof ApiError ? `查询不可用 · HTTP ${error.status} · Trace ${trace}` : '输入或响应合同不匹配，未展示未验证数据'
      setState({scope: captured, busy: false, error: message, card: null, audit: null})
    }
  }
  const exportRecord = () => {
    if (!view.audit || baseScope === 'blocked' || Date.parse(session.expiresAt) <= Date.now()) return
    const record = localDisposition(view.audit, session.user.id, disposition)
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type: 'application/json'}))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'fastlink-support-disposition.json'; anchor.click()
    URL.revokeObjectURL(url)
  }
  return <main className="admin-main"><header className="topbar"><h1>首发卡查询与客服工作台</h1><button onClick={onLogout}>退出登录</button></header><section className="page-content">
    <p>Tenant: {session.user.tenantId} · {session.user.environment} · <BuildIdentityLabel /></p>
    <p>仅持久化查询，不调用供应商，不开放卡或资金写操作。客服参考不授予任何权限。</p>
    {baseScope === 'blocked' ? <p role="alert">当前身份、权限或环境不符合首发查询边界。</p> : <>
      <section><h2>卡状态详情</h2><input aria-label="卡ID" value={cardId} disabled={view.busy} onChange={(e) => setCardId(e.target.value)} /><button disabled={view.busy} onClick={() => void lookup('card')}>读取卡快照</button></section>
      <section><h2>查询异常审计</h2><textarea aria-label="客服参考" value={reference} disabled={view.busy} onChange={(e) => setReference(e.target.value)} maxLength={1024} /><button disabled={view.busy} onClick={() => void lookup('audit')}>查询Trace审计</button></section>
    </>}
    <SupportCasePanel session={session} reference={reference} scope={baseScope} invalidateSession={invalidateSession} />
    {view.busy && <p role="status">读取中…</p>}{view.error && <p role="alert">{view.error}</p>}
    {view.card?.kind === 'CARD' && <section><h2>持久化卡快照</h2><pre>{JSON.stringify(view.card.value, null, 2)}</pre></section>}
    {view.audit && <section><h2>最小审计结果</h2><p>{view.audit.status === 'NO_RECORDS' ? '没有匹配审计记录，不能据此判断故障已解决；请升级处理。' : '已找到匹配记录，这不表示故障已解决。'}{view.audit.truncated && ' 结果已截断。'}</p><pre>{JSON.stringify(view.audit.records, null, 2)}</pre>
      <label>处置分类<select value={disposition} onChange={(e) => setDisposition(e.target.value)}><option value="ESCALATED">升级处理</option><option value="REFERRED">转交责任人</option><option value="EXPLAINED">已向客户解释</option></select></label><button onClick={exportRecord}>导出本地处置记录</button><p>仅本地交付记录，未写入服务端工单，不作为正式工单结案。</p>
    </section>}
  </section></main>
}
