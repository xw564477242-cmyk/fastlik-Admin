export const ADMIN_KYC_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
export const MAX_ADMIN_KYC_JSON_BYTES = 4_096

export type AdminKycEnvironment = 'SANDBOX' | 'TEST'
export type AdminKycStatus = (typeof ADMIN_KYC_STATUSES)[number]
export type AdminKycRecord = Readonly<{
  userId: string
  status: AdminKycStatus
  reviewedAt: string | null
}>

export type AdminKycSession = Readonly<{
  accessToken: string
  expiresAt: string
  user: Readonly<{
    id: string
    tenantId: string
    environment: string
    roles: readonly string[]
    permissions: readonly string[]
  }>
}>

export class AdminKycContractError extends Error {}

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const SAFE_ID = /^[A-Za-z0-9_-]{2,128}$/

const validId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value)

const validRfc3339 = (value: unknown): value is string => {
  if (typeof value !== 'string' || !RFC3339.test(value) || !Number.isFinite(Date.parse(value))) return false
  const [date] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const normalized = new Date(Date.UTC(year, month - 1, day))
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
}

const rejectDuplicateTopLevelKeys = (raw: string): void => {
  const keys = new Set<string>()
  let depth = 0
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]
    if (character === '{' || character === '[') { depth += 1; continue }
    if (character === '}' || character === ']') { depth -= 1; continue }
    if (character !== '"') continue
    const start = index
    index += 1
    while (index < raw.length) {
      if (raw[index] === '\\') { index += 2; continue }
      if (raw[index] === '"') break
      index += 1
    }
    if (index >= raw.length) return
    let cursor = index + 1
    while (/\s/.test(raw[cursor] ?? '')) cursor += 1
    if (depth !== 1 || raw[cursor] !== ':') continue
    let key: string
    try { key = JSON.parse(raw.slice(start, index + 1)) as string } catch { return }
    if (keys.has(key)) throw new AdminKycContractError('Duplicate Admin KYC response field')
    keys.add(key)
  }
}

export const adminKycPath = (
  tenantId: string,
  userId: string,
  environment: AdminKycEnvironment,
): string => {
  if (!validId(tenantId)) throw new AdminKycContractError('Invalid Admin KYC tenant')
  if (!validId(userId)) throw new AdminKycContractError('Invalid Admin KYC user lookup')
  if (environment !== 'SANDBOX' && environment !== 'TEST')
    throw new AdminKycContractError('Admin KYC is available only in SANDBOX or TEST')
  return `/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/kyc?environment=${environment}`
}

export const parseAdminKycResponse = (raw: string, expectedUserId: string): AdminKycRecord => {
  if (!validId(expectedUserId)) throw new AdminKycContractError('Invalid Admin KYC user lookup')
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_ADMIN_KYC_JSON_BYTES)
    throw new AdminKycContractError('Admin KYC response could not be verified')
  rejectDuplicateTopLevelKeys(raw)
  let value: unknown
  try { value = JSON.parse(raw) as unknown } catch { throw new AdminKycContractError('Admin KYC response could not be verified') }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new AdminKycContractError('Admin KYC response could not be verified')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Object.keys(descriptors).sort()
  if (keys.join(',') !== 'reviewedAt,status,userId')
    throw new AdminKycContractError('Admin KYC response must contain exactly userId, status and reviewedAt')
  const userId = descriptors.userId
  const status = descriptors.status
  const reviewedAt = descriptors.reviewedAt
  if (![userId, status, reviewedAt].every((descriptor) => descriptor && 'value' in descriptor))
    throw new AdminKycContractError('Admin KYC response could not be verified')
  if (userId.value !== expectedUserId)
    throw new AdminKycContractError('Admin KYC response does not match the requested user')
  if (!(ADMIN_KYC_STATUSES as readonly unknown[]).includes(status.value))
    throw new AdminKycContractError('Invalid Admin KYC status')
  if (reviewedAt.value !== null && !validRfc3339(reviewedAt.value))
    throw new AdminKycContractError('Invalid Admin KYC reviewedAt')
  return Object.freeze({
    userId: userId.value as string,
    status: status.value as AdminKycStatus,
    reviewedAt: reviewedAt.value as string | null,
  })
}

export const adminKycSessionReadAllowed = (
  session: AdminKycSession,
  runtimeEnvironment: string | undefined,
  selectedTenantId: string,
  tab: string,
  now = Date.now(),
): boolean => {
  if (runtimeEnvironment !== 'SANDBOX' && runtimeEnvironment !== 'TEST') return false
  if (session.user.environment !== runtimeEnvironment || tab !== 'user') return false
  if (!validId(session.user.id) || !validId(session.user.tenantId) || !validId(selectedTenantId)) return false
  if (typeof session.accessToken !== 'string' || session.accessToken.trim().length === 0) return false
  const expiry = Date.parse(session.expiresAt)
  return Number.isFinite(expiry) && expiry > now
}

export const adminKycBaseScope = (
  session: AdminKycSession,
  runtimeEnvironment: string | undefined,
  selectedTenantId: string,
  tab: string,
  now = Date.now(),
): string | null => {
  if (!adminKycSessionReadAllowed(session, runtimeEnvironment, selectedTenantId, tab, now)) return null
  return JSON.stringify([
    session.user.id,
    session.expiresAt,
    session.user.tenantId,
    selectedTenantId,
    session.user.environment,
    [...session.user.roles].sort(),
    [...session.user.permissions].sort(),
    tab,
  ])
}

export const adminKycLookupScope = (
  baseScope: string | null,
  userId: string,
): string | null => {
  if (!baseScope || !validId(userId)) return null
  return `${baseScope}\u0000${userId}`
}
