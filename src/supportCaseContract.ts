export type SupportCase = Readonly<{
  version: number; id: string; tenantId: string; environment: 'SANDBOX' | 'TEST'; traceId: string;
  reason: 'QUERY_UNAVAILABLE' | 'STATUS_QUESTION'; status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  createdBy: string; assignedTo: string; resolution: 'REFERRED' | 'EXPLAINED' | null;
  createdAt: string; updatedAt: string; closedAt: string | null;
}>
const keys = ['version','id','tenantId','environment','traceId','reason','status','createdBy','assignedTo','resolution','createdAt','updatedAt','closedAt']
function invalid(): never { throw new Error('Invalid support contract') }
const safeId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(v)
export function parseSupportCase(value: unknown, tenantId: string, environment: string, traceId: string): SupportCase {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',') || v.tenantId !== tenantId || v.environment !== environment || v.traceId !== traceId
    || !['SANDBOX','TEST'].includes(environment) || !safeId(v.id) || !safeId(v.createdBy) || !safeId(v.assignedTo)
    || !Number.isSafeInteger(v.version) || Number(v.version) < 1 || !['QUERY_UNAVAILABLE','STATUS_QUESTION'].includes(String(v.reason))
    || !['OPEN','IN_PROGRESS','CLOSED'].includes(String(v.status))) invalid()
  for (const key of ['createdAt','updatedAt']) if (typeof v[key] !== 'string' || !Number.isFinite(Date.parse(v[key] as string))) invalid()
  if (v.status === 'CLOSED') {
    if (!['REFERRED','EXPLAINED'].includes(String(v.resolution)) || typeof v.closedAt !== 'string' || !Number.isFinite(Date.parse(v.closedAt))) invalid()
  } else if (v.resolution !== null || v.closedAt !== null) invalid()
  return v as SupportCase
}
export function parseSupportList(value: unknown, tenantId: string, environment: string, traceId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== 'records,truncated' || !Array.isArray(v.records) || v.records.length > 25 || typeof v.truncated !== 'boolean') invalid()
  const records = v.records.map(row => parseSupportCase(row, tenantId, environment, traceId))
  if (new Set(records.map(row => row.id)).size !== records.length) invalid()
  return { records, truncated: v.truncated }
}
