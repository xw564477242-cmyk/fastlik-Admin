export const MAX_TENANT_DETAIL_JSON_BYTES = 8_192

export type TenantDetail = Readonly<{
  id: string
  legalName: string
  brandName: string
  slug: string
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  environment: 'SANDBOX' | 'TEST' | 'PRODUCTION'
  createdAt: string
  updatedAt: string
}>

const exactKeys = ['brandName', 'createdAt', 'environment', 'id', 'legalName', 'slug', 'status', 'updatedAt']
const identifier = /^[A-Za-z0-9_-]{3,128}$/
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function parseTenantDetailResponse(raw: string, expectedId: string, expectedEnvironment: TenantDetail['environment']): TenantDetail {
  if (new TextEncoder().encode(raw).byteLength > MAX_TENANT_DETAIL_JSON_BYTES) throw new Error('Tenant detail exceeds the consumer limit')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('Tenant detail could not be verified') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tenant detail could not be verified')
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join('\0') !== exactKeys.join('\0')) throw new Error('Tenant detail must contain exactly the public contract fields')
  if (record.id !== expectedId || typeof record.id !== 'string' || !identifier.test(record.id)) throw new Error('Tenant detail does not match the requested tenant')
  if (record.environment !== expectedEnvironment) throw new Error('Tenant detail crossed the environment boundary')
  if (typeof record.legalName !== 'string' || !record.legalName || record.legalName.length > 200) throw new Error('Tenant legal name is invalid')
  if (typeof record.brandName !== 'string' || !record.brandName || record.brandName.length > 100) throw new Error('Tenant brand name is invalid')
  if (typeof record.slug !== 'string' || !slug.test(record.slug) || record.slug.length > 63) throw new Error('Tenant slug is invalid')
  if (!['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(String(record.status))) throw new Error('Tenant status is invalid')
  for (const key of ['createdAt', 'updatedAt'] as const) {
    const parsed = typeof record[key] === 'string' ? new Date(record[key]) : null
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== record[key]) throw new Error(`Tenant ${key} is invalid`)
  }
  return Object.freeze(record as TenantDetail)
}
