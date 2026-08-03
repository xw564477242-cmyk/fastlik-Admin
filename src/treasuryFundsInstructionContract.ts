export const MAX_TREASURY_FUNDS_INSTRUCTION_JSON_BYTES = 2_048
export const MAX_TREASURY_FUNDS_INSTRUCTION_JSON_DEPTH = 4

export type TreasuryFundsEnvironment = 'SANDBOX' | 'TEST'
export type TreasuryFundsDirection = 'INFLOW' | 'OUTFLOW'
export type TreasuryJournalAccountRole = 'CLEARING' | 'TREASURY'
export type TreasuryJournalEntrySide = 'DEBIT' | 'CREDIT'

export type TreasuryJournalEntry = Readonly<{
  accountRole: TreasuryJournalAccountRole
  side: TreasuryJournalEntrySide
  assetCode: string
  amountMinor: string
}>

export type TreasuryFundsInstructionReceipt = Readonly<{
  instructionId: string
  operationId: string
  status: 'COMPLETED'
  direction: TreasuryFundsDirection
  assetCode: string
  amountMinor: string
  completedAt: string
  journal: Readonly<{
    id: string
    status: 'POSTED'
    entries: readonly TreasuryJournalEntry[]
  }>
  treasury: Readonly<{
    availableBalanceMinor: string
    version: number
  }>
  auditRecorded: true
}>

export type TreasuryFundsSession = Readonly<{
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

export type TreasuryFundsFailurePolicy = Readonly<{
  status: number | null
  clearSnapshot: boolean
  invalidateSession: boolean
}>

export class TreasuryFundsInstructionContractError extends Error {}

const PUBLIC_ID = /^[A-Za-z0-9._:-]{2,128}$/
const INSTRUCTION_ID = /^[A-Za-z0-9._:-]{8,80}$/
const AUTHORITY = /^[A-Za-z0-9:*._-]{1,128}$/
const ASSET_CODE = /^[A-Z0-9]{2,12}$/
const POSITIVE_MINOR = /^[1-9][0-9]{0,17}$/
const NON_NEGATIVE_MINOR = /^(?:0|[1-9][0-9]{0,17})$/
const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/

const ownData = (value: object, field: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, field)
  if (!descriptor || !('value' in descriptor)) throw new TreasuryFundsInstructionContractError('Treasury receipt contains an unreadable field')
  return descriptor.value
}

const exactObject = (value: unknown, fields: readonly string[], label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TreasuryFundsInstructionContractError(`${label} must be an exact object`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Object.values(descriptors).some((descriptor) => !('value' in descriptor))) {
    throw new TreasuryFundsInstructionContractError(`${label} contains an accessor`)
  }
  if (Object.keys(descriptors).sort().join('\u0000') !== [...fields].sort().join('\u0000')) {
    throw new TreasuryFundsInstructionContractError(`${label} fields do not match the Backend contract`)
  }
  return value as Record<string, unknown>
}

const duplicateJsonKeys = (raw: string): void => {
  const stack: Array<{ kind: 'object'; keys: Set<string> } | { kind: 'array' }> = []
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]
    if (character === '{') { stack.push({ kind: 'object', keys: new Set() }); continue }
    if (character === '[') { stack.push({ kind: 'array' }); continue }
    if (character === '}' || character === ']') { stack.pop(); continue }
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
    const current = stack.at(-1)
    if (current?.kind !== 'object' || raw[cursor] !== ':') continue
    let key: string
    try { key = JSON.parse(raw.slice(start, index + 1)) as string } catch { return }
    if (current.keys.has(key)) throw new TreasuryFundsInstructionContractError('Treasury receipt contains a duplicate field')
    current.keys.add(key)
  }
}

const jsonDepth = (value: unknown, depth = 0): number => {
  if (!value || typeof value !== 'object') return depth
  const children = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>)
  return children.reduce((maximum, child) => Math.max(maximum, jsonDepth(child, depth + 1)), depth + 1)
}

const stringField = (object: object, field: string, pattern: RegExp, label: string): string => {
  const value = ownData(object, field)
  if (typeof value !== 'string' || !pattern.test(value)) throw new TreasuryFundsInstructionContractError(`${label} is invalid`)
  return value
}

const publicId = (object: object, field: string, label: string): string => stringField(object, field, PUBLIC_ID, label)

const hasPermission = (permissions: readonly string[], required: string): boolean => {
  const domain = required.split(':', 1)[0]
  return permissions.includes('*') || permissions.includes(required) || permissions.includes(`${domain}:*`)
}

const validAuthorities = (value: unknown): value is readonly string[] => Array.isArray(value)
  && value.length > 0
  && value.every((item) => typeof item === 'string' && AUTHORITY.test(item))

export const treasuryFundsSessionReadAllowed = (
  session: TreasuryFundsSession,
  runtimeEnvironment: string | undefined,
  selectedTenantId: string,
  now = Date.now(),
): boolean => {
  if (runtimeEnvironment !== 'SANDBOX' && runtimeEnvironment !== 'TEST') return false
  if (session.user.environment !== runtimeEnvironment) return false
  if (!PUBLIC_ID.test(session.user.id) || !PUBLIC_ID.test(session.user.tenantId) || !PUBLIC_ID.test(selectedTenantId)) return false
  if (!validAuthorities(session.user.roles) || !validAuthorities(session.user.permissions)) return false
  if (!hasPermission(session.user.permissions, 'admin:read')) return false
  if (selectedTenantId !== session.user.tenantId && !hasPermission(session.user.permissions, 'platform:tenants:write')) return false
  if (typeof session.accessToken !== 'string' || session.accessToken.length < 32 || session.accessToken.length > 256) return false
  const expiry = Date.parse(session.expiresAt)
  return Number.isFinite(expiry) && expiry > now
}

export const treasuryFundsBaseScope = (
  session: TreasuryFundsSession,
  runtimeEnvironment: string | undefined,
  selectedTenantId: string,
  now = Date.now(),
): string | null => {
  if (!treasuryFundsSessionReadAllowed(session, runtimeEnvironment, selectedTenantId, now)) return null
  return JSON.stringify([
    session.user.id,
    session.expiresAt,
    session.user.tenantId,
    selectedTenantId,
    runtimeEnvironment,
    [...session.user.roles].sort(),
    [...session.user.permissions].sort(),
  ])
}

export const treasuryFundsLookupScope = (baseScope: string | null, operationId: string): string | null => {
  if (!baseScope || !PUBLIC_ID.test(operationId)) return null
  return `${baseScope}\u0000${operationId}`
}

export const treasuryFundsFailurePolicy = (error: unknown): TreasuryFundsFailurePolicy => {
  if (!error || typeof error !== 'object') return Object.freeze({ status: null, clearSnapshot: false, invalidateSession: false })
  const descriptor = Object.getOwnPropertyDescriptor(error, 'status')
  const status = descriptor && 'value' in descriptor && typeof descriptor.value === 'number' ? descriptor.value : null
  return Object.freeze({
    status,
    clearSnapshot: status === 401 || status === 403 || status === 404,
    invalidateSession: status === 401,
  })
}

export const parseTreasuryFundsInstructionReceipt = (
  raw: string,
  expectedOperationId: string,
): TreasuryFundsInstructionReceipt => {
  if (!PUBLIC_ID.test(expectedOperationId)) throw new TreasuryFundsInstructionContractError('Treasury operation lookup is invalid')
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_TREASURY_FUNDS_INSTRUCTION_JSON_BYTES) {
    throw new TreasuryFundsInstructionContractError('Treasury receipt exceeds the bounded contract')
  }
  duplicateJsonKeys(raw)
  let value: unknown
  try { value = JSON.parse(raw) as unknown } catch { throw new TreasuryFundsInstructionContractError('Treasury receipt is not valid JSON') }
  if (jsonDepth(value) > MAX_TREASURY_FUNDS_INSTRUCTION_JSON_DEPTH) {
    throw new TreasuryFundsInstructionContractError('Treasury receipt exceeds the allowed depth')
  }
  const root = exactObject(value, [
    'instructionId', 'operationId', 'status', 'direction', 'assetCode', 'amountMinor',
    'completedAt', 'journal', 'treasury', 'auditRecorded',
  ], 'Treasury receipt')
  const instructionId = stringField(root, 'instructionId', INSTRUCTION_ID, 'instructionId')
  const operationId = publicId(root, 'operationId', 'operationId')
  if (operationId !== expectedOperationId) throw new TreasuryFundsInstructionContractError('Treasury receipt operation does not match the lookup')
  if (ownData(root, 'status') !== 'COMPLETED') throw new TreasuryFundsInstructionContractError('Treasury receipt status is invalid')
  const direction = ownData(root, 'direction')
  if (direction !== 'INFLOW' && direction !== 'OUTFLOW') throw new TreasuryFundsInstructionContractError('Treasury receipt direction is invalid')
  const assetCode = stringField(root, 'assetCode', ASSET_CODE, 'assetCode')
  const amountMinor = stringField(root, 'amountMinor', POSITIVE_MINOR, 'amountMinor')
  const completedAt = stringField(root, 'completedAt', CANONICAL_ISO, 'completedAt')
  if (!Number.isFinite(Date.parse(completedAt)) || new Date(completedAt).toISOString() !== completedAt) {
    throw new TreasuryFundsInstructionContractError('completedAt is invalid')
  }

  const journalSource = exactObject(ownData(root, 'journal'), ['id', 'status', 'entries'], 'Treasury Journal')
  const journalId = publicId(journalSource, 'id', 'journal.id')
  if (ownData(journalSource, 'status') !== 'POSTED') throw new TreasuryFundsInstructionContractError('Treasury Journal status is invalid')
  const entrySources = ownData(journalSource, 'entries')
  if (!Array.isArray(entrySources) || entrySources.length !== 2) throw new TreasuryFundsInstructionContractError('Treasury Journal must contain exactly two entries')
  const entries = entrySources.map((entry, index): TreasuryJournalEntry => {
    const source = exactObject(entry, ['accountRole', 'side', 'assetCode', 'amountMinor'], `Treasury Journal entry ${index + 1}`)
    const accountRole = ownData(source, 'accountRole')
    const side = ownData(source, 'side')
    if (accountRole !== 'CLEARING' && accountRole !== 'TREASURY') throw new TreasuryFundsInstructionContractError('Treasury Journal account role is invalid')
    if (side !== 'DEBIT' && side !== 'CREDIT') throw new TreasuryFundsInstructionContractError('Treasury Journal side is invalid')
    if (stringField(source, 'assetCode', ASSET_CODE, 'entry.assetCode') !== assetCode) throw new TreasuryFundsInstructionContractError('Treasury Journal asset does not match the receipt')
    if (stringField(source, 'amountMinor', POSITIVE_MINOR, 'entry.amountMinor') !== amountMinor) throw new TreasuryFundsInstructionContractError('Treasury Journal amount does not match the receipt')
    return Object.freeze({ accountRole, side, assetCode, amountMinor })
  })
  if (entries[0].accountRole !== 'CLEARING' || entries[1].accountRole !== 'TREASURY') {
    throw new TreasuryFundsInstructionContractError('Treasury Journal entry order is invalid')
  }
  const expectedSides = direction === 'INFLOW' ? ['CREDIT', 'DEBIT'] : ['DEBIT', 'CREDIT']
  if (entries[0].side !== expectedSides[0] || entries[1].side !== expectedSides[1]) {
    throw new TreasuryFundsInstructionContractError('Treasury Journal is not directionally balanced')
  }

  const treasurySource = exactObject(ownData(root, 'treasury'), ['availableBalanceMinor', 'version'], 'Treasury position')
  const availableBalanceMinor = stringField(treasurySource, 'availableBalanceMinor', NON_NEGATIVE_MINOR, 'availableBalanceMinor')
  const version = ownData(treasurySource, 'version')
  if (!Number.isSafeInteger(version) || (version as number) < 1 || (version as number) > 2_147_483_647) {
    throw new TreasuryFundsInstructionContractError('Treasury position version is invalid')
  }
  if (ownData(root, 'auditRecorded') !== true) throw new TreasuryFundsInstructionContractError('Treasury audit receipt is missing')

  return Object.freeze({
    instructionId,
    operationId,
    status: 'COMPLETED',
    direction,
    assetCode,
    amountMinor,
    completedAt,
    journal: Object.freeze({ id: journalId, status: 'POSTED', entries: Object.freeze(entries) }),
    treasury: Object.freeze({ availableBalanceMinor, version: version as number }),
    auditRecorded: true,
  })
}
