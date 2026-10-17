import { runtimeConfig } from './runtimeConfig'
import { useState } from 'react'
import { type AdminSession } from './productionApi'
import { B10Users } from './B10Users'
import { LaunchReadOnlyAdmin } from './LaunchReadOnlyAdmin'

type Tab = 'users' | 'kyc' | 'support'
type Props = { session: AdminSession; onLogout: () => void; invalidateSession: (token: string) => void }

export function B10Workspace({ session, onLogout, invalidateSession }: Props) {
  const [tab, setTab] = useState<Tab>('users')
  const identity = JSON.stringify([session.user.id, session.user.tenantId, session.user.environment,
    session.expiresAt, [...session.user.permissions].sort()])
  return <>
    <header className="topbar"><h1>FastLink 用户与客服工作台</h1><button onClick={onLogout}>退出登录</button></header>
    <nav aria-label="本批后台页面" className="workspace-tabs">
      {([['users', '用户管理'], ['kyc', runtimeConfig.previewReadOnly ? 'KYC 状态' : 'KYC 审核'], ['support', '客服工单与卡查询']] as const).map(([value, label]) =>
        <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}
    </nav>
    <p>当前租户：{session.user.tenantId} · {session.user.environment}。页面可见不代表服务端已授予操作权限。</p>
    <p>本批为 DEV 合成数据联调；KYC状态不代表真实身份核验，资金与真实卡操作未开放。</p>
    {tab === 'support'
      ? <LaunchReadOnlyAdmin key={`support:${identity}`} session={session} onLogout={onLogout} invalidateSession={invalidateSession} />
      : <main key={`${tab}:${identity}`} className="page-content">
        <B10Users session={session} review={tab==='kyc'} invalidateSession={invalidateSession}/>
      </main>}
  </>
}
