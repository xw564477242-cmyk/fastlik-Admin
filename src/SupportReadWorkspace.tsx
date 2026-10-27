import { useEffect, useRef, useState } from 'react'
import { ApiError, DEFAULT_API, productionApi, type AdminSession } from './productionApi'
import { parseSupportAudit, type SupportAudit } from './launchReadOnlyContract'
import { SupportCasePanel } from './SupportCasePanel'

export function SupportReadWorkspace({ session, tenantId, invalidateSession }: {
  session: AdminSession; tenantId: string; invalidateSession: (token: string) => void
}) {
  const scope = `${session.accessToken}\u0000${session.user.id}\u0000${session.expiresAt}\u0000${tenantId}\u0000${session.user.environment}`
  const [input, setInput] = useState({ scope, traceId: '' })
  const traceId = input.scope === scope ? input.traceId : ''
  const allowed = tenantId === session.user.tenantId && ['TEST', 'SANDBOX'].includes(session.user.environment)
    && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt) > Date.now()
    && session.user.permissions.some(p => ['*', 'admin:*', 'admin:read'].includes(p))
  const validTrace = /^[A-Za-z0-9._:-]{8,128}$/.test(traceId.trim())
  const reference = validTrace ? JSON.stringify({ version: 1, tenantId, environment: session.user.environment, traceId: traceId.trim() }) : ''
  const requestScope = `${scope}\u0000${reference}`
  const current = useRef(requestScope); current.current = requestScope
  const abort = useRef<AbortController | null>(null)
  const [audit, setAudit] = useState<{ scope: string; busy: boolean; value: SupportAudit | null; error: string }>({ scope: requestScope, busy: false, value: null, error: '' })
  const visible = audit.scope === requestScope && allowed ? audit : { busy: false, value: null, error: '' }
  useEffect(() => () => { abort.current?.abort() }, [requestScope])
  const readAudit = async () => {
    if (!allowed || !validTrace || visible.busy) return
    const captured = requestScope
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    setAudit({ scope: captured, busy: true, value: null, error: '' })
    const accepts = () => !controller.signal.aborted && current.current === captured && Date.parse(session.expiresAt) > Date.now()
    try {
      const wire = await productionApi.cardSupportAudit(DEFAULT_API, session.accessToken, tenantId, traceId.trim(), controller.signal)
      const value = parseSupportAudit(wire, { version: 1, tenantId, environment: session.user.environment as 'TEST' | 'SANDBOX', traceId: traceId.trim() })
      if (accepts()) setAudit({ scope: captured, busy: false, value, error: '' })
    } catch (error) {
      if (!accepts()) return
      if (error instanceof ApiError && error.status === 401) invalidateSession(session.accessToken)
      setAudit({ scope: captured, busy: false, value: null, error: error instanceof ApiError ? `审计查询未完成 · HTTP ${error.status} · Trace ${error.traceId}` : '响应与当前租户／Trace合同不匹配，未显示未验证数据' })
    }
  }
  return <section className="panel"><h2>客服查询与关联审计</h2>
    <p>输入实际请求的 Trace ID，查询同租户工单及最小审计结果；查询为空不代表问题已解决。不会创建、接手或关闭工单。</p>
    <label>客服 Trace ID<input value={traceId} onChange={e => { abort.current?.abort(); setInput({ scope, traceId: e.target.value }) }} maxLength={128} /></label>
    {!allowed && <p role="alert">当前会话或租户范围不允许查询。</p>}
    <SupportCasePanel session={session} reference={reference} scope={allowed && validTrace ? scope : 'blocked'} invalidateSession={invalidateSession} readOnly />
    <button disabled={!allowed || !validTrace || visible.busy} onClick={() => void readAudit()}>读取关联查询审计</button>
    {visible.busy && <p role="status">正在读取关联审计…</p>}{visible.error && <p role="alert">{visible.error}</p>}
    {visible.value && <section><h3>最小查询审计</h3><p>{visible.value.status === 'NO_RECORDS' ? '服务端返回零条匹配审计；不能据此判定故障已解决。' : '已找到匹配审计记录。'}{visible.value.truncated && '结果超过25条，已截断。'}</p>
      <table><thead><tr><th>记录</th><th>时间</th><th>结果</th><th>HTTP</th></tr></thead><tbody>{visible.value.records.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.occurredAt}</td><td>{row.outcome}</td><td>{row.statusCode ?? '未设置'}</td></tr>)}</tbody></table>
    </section>}
  </section>
}
