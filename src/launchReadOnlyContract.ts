export { adminRequestAllowed as launchAdminRequestAllowed } from './launch/b10-policy'

export type SupportReference = Readonly<{version: 1; tenantId: string; environment: 'SANDBOX' | 'TEST'; traceId: string}>
export type SupportAudit = SupportReference & Readonly<{
  status: 'FOUND' | 'NO_RECORDS'; truncated: boolean
  records: ReadonlyArray<{id: string; occurredAt: string; outcome: 'SUCCESS' | 'ERROR' | 'UNKNOWN'; statusCode: number | null}>
}>

const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === keys.sort().join(',')

export function parseSupportReference(raw: string, tenantId: string, environment: string): SupportReference {
  if (raw.length > 1024) throw new Error('客服参考超过大小限制')
  const value: unknown = JSON.parse(raw)
  if (!exact(value, ['version', 'tenantId', 'environment', 'traceId']) || value.version !== 1
    || value.tenantId !== tenantId || value.environment !== environment
    || !['SANDBOX', 'TEST'].includes(environment)
    || typeof value.traceId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value.traceId)) throw new Error('客服参考与当前租户／环境不匹配')
  return value as SupportReference
}

export function parseSupportAudit(raw: string, expected: SupportReference): SupportAudit {
  if (raw.length > 32768) throw new Error('审计响应超过大小限制')
  const value: unknown = JSON.parse(raw)
  if (!exact(value, ['version', 'tenantId', 'environment', 'traceId', 'status', 'truncated', 'records'])
    || value.version !== 1 || value.tenantId !== expected.tenantId || value.environment !== expected.environment
    || value.traceId !== expected.traceId || !['FOUND', 'NO_RECORDS'].includes(String(value.status))
    || typeof value.truncated !== 'boolean' || !Array.isArray(value.records) || value.records.length > 25) throw new Error('审计响应身份或合同不匹配')
  const ids = new Set<string>()
  for (const row of value.records) {
    if (!exact(row, ['id', 'occurredAt', 'outcome', 'statusCode'])
      || typeof row.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(row.id) || ids.has(row.id)
      || typeof row.occurredAt !== 'string' || !Number.isFinite(Date.parse(row.occurredAt))
      || !['SUCCESS', 'ERROR', 'UNKNOWN'].includes(String(row.outcome))
      || !(row.statusCode === null || typeof row.statusCode === 'number' && Number.isInteger(row.statusCode) && row.statusCode >= 100 && row.statusCode <= 599)) throw new Error('审计记录合同不匹配')
    ids.add(row.id)
  }
  if ((value.status === 'NO_RECORDS') !== (value.records.length === 0) || value.status === 'NO_RECORDS' && value.truncated) throw new Error('审计状态不一致')
  return value as SupportAudit
}

export function localDisposition(audit: SupportAudit, operatorId: string, disposition: string) {
  if (!['REFERRED', 'ESCALATED', 'EXPLAINED'].includes(disposition)) throw new Error('Invalid disposition')
  return { version: 1, kind: 'LOCAL_SUPPORT_DISPOSITION', persisted: false, operatorId,
    tenantId: audit.tenantId, environment: audit.environment, traceId: audit.traceId,
    auditStatus: audit.status, disposition, recordedAt: new Date().toISOString() }
}
