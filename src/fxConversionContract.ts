import type { AdminSession } from './productionApi.ts'
import type { DataSource } from './adminRoutes.ts'

export const MAX_FX_CONVERSION_JSON_BYTES = 32_768
const FIELDS = Object.freeze([
  'id', 'cardId', 'cardType', 'environment', 'quoteId', 'sourceWalletAccountId',
  'destinationWalletAccountId', 'sourceAssetCode', 'targetAssetCode', 'sourceAmount',
  'targetAmount', 'rate', 'status', 'createdAt', 'completedAt',
] as const)
const idPattern = /^[A-Za-z0-9._:-]{2,128}$/
const assetPattern = /^[A-Z0-9]{2,12}$/
const positiveDecimalPattern = /^(?=.*[1-9])(?:0|[1-9]\d{0,17})(?:\.(?:[1-9]|\d{1,17}[1-9]))?$/
const statuses = Object.freeze(['PROCESSING', 'PENDING_SETTLEMENT', 'COMPLETED', 'FAILED'] as const)

export type FxConversionEnvironment = Extract<DataSource, 'SANDBOX' | 'TEST'>
export type FxConversion = Readonly<{
  id: string
  cardId: string
  cardType: 'VIRTUAL' | 'PHYSICAL'
  environment: FxConversionEnvironment
  quoteId: string
  sourceWalletAccountId: string
  destinationWalletAccountId: string
  sourceAssetCode: string
  targetAssetCode: string
  sourceAmount: string
  targetAmount: string
  rate: string
  status: (typeof statuses)[number]
  createdAt: string
  completedAt: string | null
}>

export class FxConversionContractError extends Error {
  constructor() {
    super('FX conversion response could not be verified')
    this.name = 'FxConversionContractError'
  }
}
const invalid = (): never => { throw new FxConversionContractError() }

const depthAllowed = (raw: string): boolean => {
  let depth = 0
  let quoted = false
  let escaped = false
  for (const character of raw) {
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    else if (character === '{' || character === '[') { depth += 1; if (depth > 8) return false }
    else if (character === '}' || character === ']') { depth -= 1; if (depth < 0) return false }
  }
  return depth === 0 && !quoted && !escaped
}
const parseWire = (wire: unknown): unknown => {
  if (typeof wire !== 'string' || !wire.length || wire.length > MAX_FX_CONVERSION_JSON_BYTES) return invalid()
  if (new TextEncoder().encode(wire).byteLength > MAX_FX_CONVERSION_JSON_BYTES || !depthAllowed(wire)) return invalid()
  try { return JSON.parse(wire) as unknown } catch { return invalid() }
}
const exactData = (value: unknown): Record<string, PropertyDescriptor> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Object.keys(descriptors).sort()
  const expected = [...FIELDS].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return invalid()
  if (keys.some((key) => !('value' in descriptors[key]))) return invalid()
  return descriptors
}
const value = (source: Record<string, PropertyDescriptor>, key: string): unknown => source[key]?.value
const text = (source: Record<string, PropertyDescriptor>, key: string, pattern: RegExp, max = 128): string => {
  const item = value(source, key)
  return typeof item === 'string' && item.length <= max && pattern.test(item) ? item : invalid()
}
const timestamp = (source: Record<string, PropertyDescriptor>, key: string): string => {
  const item = text(source, key, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 24)
  const parsed = new Date(item)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === item ? item : invalid()
}

export const parseFxConversionResponse = (
  wire: unknown,
  expected: Readonly<{ conversionId: string; environment: FxConversionEnvironment }>,
): FxConversion => {
  if (!idPattern.test(expected.conversionId)) return invalid()
  const source = exactData(parseWire(wire))
  const id = text(source, 'id', idPattern)
  const environment = text(source, 'environment', /^(SANDBOX|TEST)$/, 7) as FxConversionEnvironment
  if (id !== expected.conversionId || environment !== expected.environment) return invalid()
  const cardType = text(source, 'cardType', /^(VIRTUAL|PHYSICAL)$/, 8) as FxConversion['cardType']
  const status = text(source, 'status', /^(PROCESSING|PENDING_SETTLEMENT|COMPLETED|FAILED)$/, 18) as FxConversion['status']
  if (!(statuses as readonly string[]).includes(status)) return invalid()
  const createdAt = timestamp(source, 'createdAt')
  const rawCompletedAt = value(source, 'completedAt')
  const completedAt = rawCompletedAt === null ? null : timestamp(source, 'completedAt')
  if (completedAt && completedAt < createdAt) return invalid()
  return Object.freeze({
    id,
    cardId: text(source, 'cardId', idPattern),
    cardType,
    environment,
    quoteId: text(source, 'quoteId', idPattern),
    sourceWalletAccountId: text(source, 'sourceWalletAccountId', idPattern),
    destinationWalletAccountId: text(source, 'destinationWalletAccountId', idPattern),
    sourceAssetCode: text(source, 'sourceAssetCode', assetPattern, 12),
    targetAssetCode: text(source, 'targetAssetCode', assetPattern, 12),
    sourceAmount: text(source, 'sourceAmount', positiveDecimalPattern, 36),
    targetAmount: text(source, 'targetAmount', positiveDecimalPattern, 36),
    rate: text(source, 'rate', positiveDecimalPattern, 36),
    status,
    createdAt,
    completedAt,
  })
}

export const fxConversionSessionReadAllowed = (
  session: AdminSession,
  environment: DataSource,
  now: number,
): boolean => (environment === 'SANDBOX' || environment === 'TEST')
  && session.user.environment === environment
  && idPattern.test(session.user.id)
  && session.user.tenantId.length > 0
  && session.accessToken.length > 0
  && Number.isFinite(Date.parse(session.expiresAt))
  && Date.parse(session.expiresAt) > now

export const fxConversionScope = (
  session: AdminSession,
  tenantId: string,
  environment: DataSource,
  conversionId: string,
): string => JSON.stringify([
  session.user.id,
  session.expiresAt,
  session.user.tenantId,
  tenantId,
  environment,
  [...session.user.roles].sort(),
  [...session.user.permissions].sort(),
  conversionId,
])
