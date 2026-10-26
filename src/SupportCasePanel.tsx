import { runtimeConfig } from './runtimeConfig'
import { useEffect, useRef, useState } from 'react'
import { ApiError, productionApi, DEFAULT_API, type AdminSession } from './productionApi'
import { parseSupportReference } from './launchReadOnlyContract'
import { parseSupportCase, parseSupportList, type SupportCase } from './supportCaseContract'

export function SupportCasePanel({ session, reference, scope, invalidateSession, readOnly = false }: {
  session: AdminSession; reference: string; scope: string; invalidateSession: (token: string) => void; readOnly?: boolean
}) {
  const key = `${scope}\u0000${reference}\u0000${[...session.user.permissions].sort().join(',')}`
  const live = useRef(key); live.current = key
  const generation = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; abort.current?.abort() } }, [])
  useEffect(() => { generation.current++; abort.current?.abort() }, [key])
  const [state, setState] = useState<{ key: string; records: SupportCase[]; busy: boolean; error: string; truncated: boolean; loaded: boolean }>({ key, records: [], busy: false, error: '', truncated: false, loaded: false })
  const currentState = state.key === key ? state : { records: [], busy: false, error: '', truncated: false, loaded: false }
  const active = scope !== 'blocked' && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt) > Date.now()
  const permitted = (action: string) => active && (!(readOnly || runtimeConfig.previewReadOnly) || action === 'read') && session.user.permissions.includes(`support:cases:${action}`)
  const run = async (action: 'read' | 'detail' | 'create' | 'manage', row?: SupportCase, close = false) => {
    if (!permitted(action === 'detail' ? 'read' : action) || currentState.busy) return
    const captured = key; const ticket = ++generation.current
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    const valid = () => mounted.current && live.current === captured && generation.current === ticket && Date.parse(session.expiresAt) > Date.now()
    // Clear prior records before requests; stale or failed mutations must not look committed.
    setState({ key: captured, records: [], busy: true, error: '', truncated: false, loaded: false })
    try {
      const ref = parseSupportReference(reference, session.user.tenantId, session.user.environment)
      const api = productionApi
      if (action === 'read') {
        const wire = await api.supportCases(DEFAULT_API, session.accessToken, ref.tenantId, ref.traceId, controller.signal)
        const parsed = parseSupportList(wire, ref.tenantId, ref.environment, ref.traceId)
        if (valid()) setState({ key: captured, records: parsed.records, busy: false, error: '', truncated: parsed.truncated, loaded: true })
      } else if (action === 'detail') {
        if (!row) return
        const parsed = parseSupportCase(await api.supportCase(DEFAULT_API,session.accessToken,ref.tenantId,row.id,controller.signal),ref.tenantId,ref.environment,ref.traceId)
        if (parsed.id !== row.id) throw new Error('Invalid support detail contract')
        if (valid()) setState({key:captured,records:[parsed],busy:false,error:'',truncated:false,loaded:true})
      } else {
        const wire = action === 'create'
          ? await api.createSupportCase(DEFAULT_API, session.accessToken, ref.tenantId, { traceId: ref.traceId, reason: 'QUERY_UNAVAILABLE' }, controller.signal)
          : await api.manageSupportCase(DEFAULT_API, session.accessToken, ref.tenantId, row!.id, { status: close ? 'CLOSED' : 'IN_PROGRESS', resolution: close ? 'REFERRED' : null, version: row!.version }, controller.signal)
        const parsed = parseSupportCase(wire, ref.tenantId, ref.environment, ref.traceId)
        if (action === 'manage' && parsed.id !== row!.id) throw new Error('Invalid support contract')
        if (valid()) setState({ key: captured, records: [parsed], busy: false, error: '', truncated: false, loaded: true })
      }
    } catch (error) {
      if (!valid()) return
      if (error instanceof ApiError && error.status === 401) invalidateSession(session.accessToken)
      const trace = error instanceof ApiError && /^[A-Za-z0-9._:-]{8,128}$/.test(error.traceId) ? error.traceId : 'unavailable'
      setState({ key: captured, records: [], busy: false, error: `客服操作未确认成功${error instanceof ApiError ? ` · HTTP ${error.status}` : ' · 合同未验证'} · Trace ${trace}`, truncated: false, loaded: false })
    }
  }
  return <section><h2>客服工单</h2><p>请求当前配置的后台；操作权限由服务端判定，责任客服由服务端身份派生。{readOnly && '本工作区仅查询，创建及处置保持禁用。'}</p>
    <button disabled={!permitted('create') || currentState.busy} onClick={() => void run('create')}>创建客服工单</button>
    <button disabled={!permitted('read') || currentState.busy} onClick={() => void run('read')}>查询客服工单</button>
    {!active && <p>当前会话或范围不允许客服操作。</p>}
    {currentState.busy && <p role="status">客服操作中…</p>}{currentState.error && <p role="alert">{currentState.error}</p>}
    {active && currentState.loaded && currentState.records.length === 0 && <p>服务端返回零条匹配工单；未创建替代记录，不能据此判断故障已解决。</p>}
    {active && currentState.records.map(row => <article key={row.id}><p>工单 {row.id} · {row.status} · 责任客服 {row.assignedTo}</p>
      <p>Trace {row.traceId} · 原因 {row.reason} · 版本 {row.version} · 处置 {row.resolution ?? '未设置'}</p>
      <p>创建 {row.createdAt} · 更新 {row.updatedAt}{row.closedAt && ` · 关闭 ${row.closedAt}`}</p>
      <button disabled={!permitted('read') || currentState.busy} onClick={() => void run('detail',row)}>重新读取工单详情</button>
      <button disabled={!permitted('manage') || currentState.busy || row.status === 'CLOSED'} onClick={() => void run('manage', row)}>接手处置</button>
      <button disabled={!permitted('manage') || currentState.busy || row.status === 'CLOSED'} onClick={() => void run('manage', row, true)}>转交并关闭</button>
    </article>)}{currentState.truncated && <p>结果超过25项，已截断。</p>}
  </section>
}
