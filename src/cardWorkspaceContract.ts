import type { DataSource } from './adminRoutes'
import {
  MAX_ADMIN_CARD_TIMELINE_ITEMS,
  parseAdminCardTimelinePage,
  type AdminCardTimelineEvent,
} from './cardTimelineContract.ts'

export type CardWorkspaceMode = 'card' | 'history'
export type CardWorkspaceAction = 'read' | 'balance' | 'limits' | 'freeze' | 'unfreeze' | 'history' | 'transactions'
export type CardWorkspaceResponseAction = Exclude<CardWorkspaceAction, 'transactions'>

export type AdminCardType = 'VIRTUAL' | 'PHYSICAL'
export type AdminCardStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'CLOSED' | 'FAILED'

export type AdminCardBalance = Readonly<{
  cardId: string
  availableBalanceMinor: string
  currentBalanceMinor: string
  pendingAmountMinor: string
  currency: string
  asOf: string
}>

export type AdminCardDetail = Readonly<{
  id: string
  customerId: string
  environment: Extract<DataSource, 'SANDBOX' | 'TEST'>
  type: AdminCardType
  status: AdminCardStatus
  maskedPan: string | null
  last4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  currency: string
  alias: string | null
  createdAt: string
  updatedAt: string
}>

export type AdminCardLimits = Readonly<{
  cardId: string
  singleTransactionMinor: string | null
  dailySpendMinor: string | null
  monthlySpendMinor: string | null
  dailyAtmMinor: string | null
  asOf: string | null
}>

export type CardTimelineItem = AdminCardTimelineEvent

export type CardWorkspaceView =
  | { kind: 'CARD'; value: AdminCardDetail; empty: false; truncated: false }
  | { kind: 'BALANCE'; value: AdminCardBalance; empty: false; truncated: false }
  | { kind: 'LIMITS'; value: AdminCardLimits; empty: false; truncated: false }
  | { kind: 'TIMELINE'; value: CardTimelineItem[]; empty: boolean; truncated: boolean }

export type CardWorkspaceDisplayState = {
  cardId: string
  view: CardWorkspaceView | null
  busy: string
  error: string
}

export const MAX_CARD_TIMELINE_ITEMS = MAX_ADMIN_CARD_TIMELINE_ITEMS
export const MAX_CARD_WORKSPACE_JSON_BYTES = 262_144
export const MAX_CARD_WORKSPACE_JSON_DEPTH = 16

const hiddenCardWorkspaceState: CardWorkspaceDisplayState = {
  cardId: '',
  view: null,
  busy: '',
  error: '',
}

export const visibleCardWorkspaceState = (
  stateScope: string,
  currentBaseScope: string,
  state: CardWorkspaceDisplayState,
): CardWorkspaceDisplayState => stateScope === currentBaseScope ? state : hiddenCardWorkspaceState

export class CardWorkspaceContractError extends Error {
  readonly code: 'INVALID_CARD_DETAIL' | 'INVALID_CARD_BALANCE' | 'INVALID_CARD_LIMITS' | 'INVALID_CARD_TIMELINE' | 'CARD_ID_MISMATCH'

  constructor(code: 'INVALID_CARD_DETAIL' | 'INVALID_CARD_BALANCE' | 'INVALID_CARD_LIMITS' | 'INVALID_CARD_TIMELINE' | 'CARD_ID_MISMATCH') {
    super({
      INVALID_CARD_DETAIL: 'Card detail response could not be verified',
      INVALID_CARD_BALANCE: 'Card balance response could not be verified',
      INVALID_CARD_LIMITS: 'Card limits response could not be verified',
      INVALID_CARD_TIMELINE: 'Card timeline response could not be verified',
      CARD_ID_MISMATCH: 'Card response does not match the requested Card ID',
    }[code])
    this.code = code
    this.name = 'CardWorkspaceContractError'
  }
}

type ContractCode = CardWorkspaceContractError['code']
type OwnData = Readonly<Record<string, PropertyDescriptor>>

const invalid = (code: ContractCode): never => { throw new CardWorkspaceContractError(code) }

const jsonDepthWithinLimit = (raw: string): boolean => {
  let depth = 0
  let inString = false
  let escaped = false
  for (const character of raw) {
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{' || character === '[') {
      depth += 1
      if (depth > MAX_CARD_WORKSPACE_JSON_DEPTH) return false
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return !inString && !escaped && depth === 0
}

const rejectDuplicateJsonKeys = (raw: string, code: ContractCode): void => {
  let index = 0
  const malformed = () => invalid(code)
  const whitespace = () => { while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1 }
  const readString = (): string => {
    const start = index
    if (raw[index] !== '"') return malformed()
    index += 1
    while (index < raw.length) {
      const character = raw.charCodeAt(index)
      if (character === 0x22) {
        index += 1
        try {
          const decoded = JSON.parse(raw.slice(start, index)) as unknown
          return typeof decoded === 'string' ? decoded : malformed()
        } catch { return malformed() }
      }
      if (character <= 0x1f) return malformed()
      if (character === 0x5c) {
        index += 1
        if (index >= raw.length) return malformed()
        if (raw[index] === 'u') {
          if (!/^[0-9A-Fa-f]{4}$/.test(raw.slice(index + 1, index + 5))) return malformed()
          index += 5
        } else index += 1
      } else index += 1
    }
    return malformed()
  }
  const parseValue = (depth: number): void => {
    if (depth > MAX_CARD_WORKSPACE_JSON_DEPTH) return malformed()
    whitespace()
    if (raw[index] === '{') {
      index += 1
      whitespace()
      const keys = new Set<string>()
      if (raw[index] === '}') { index += 1; return }
      while (index < raw.length) {
        const key = readString()
        if (keys.has(key)) return malformed()
        keys.add(key)
        whitespace()
        if (raw[index] !== ':') return malformed()
        index += 1
        parseValue(depth + 1)
        whitespace()
        if (raw[index] === '}') { index += 1; return }
        if (raw[index] !== ',') return malformed()
        index += 1
        whitespace()
      }
      return malformed()
    }
    if (raw[index] === '[') {
      index += 1
      whitespace()
      if (raw[index] === ']') { index += 1; return }
      while (index < raw.length) {
        parseValue(depth + 1)
        whitespace()
        if (raw[index] === ']') { index += 1; return }
        if (raw[index] !== ',') return malformed()
        index += 1
        whitespace()
      }
      return malformed()
    }
    if (raw[index] === '"') { readString(); return }
    for (const literal of ['true', 'false', 'null']) {
      if (raw.startsWith(literal, index)) { index += literal.length; return }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index))
    if (!number) return malformed()
    index += number[0].length
  }
  whitespace()
  parseValue(0)
  whitespace()
  if (index !== raw.length) malformed()
}

const boundedJson = (wireValue: unknown, code: ContractCode): unknown => {
  if (typeof wireValue !== 'string' || wireValue.length === 0) invalid(code)
  // UTF-8 is never shorter than the number of UTF-16 code units for valid JSON.
  // Reject obviously oversized input before allocating an encoded copy.
  if (wireValue.length > MAX_CARD_WORKSPACE_JSON_BYTES) invalid(code)
  if (new TextEncoder().encode(wireValue).byteLength > MAX_CARD_WORKSPACE_JSON_BYTES) invalid(code)
  if (!jsonDepthWithinLimit(wireValue)) invalid(code)
  rejectDuplicateJsonKeys(wireValue, code)
  try {
    return JSON.parse(wireValue) as unknown
  } catch {
    return invalid(code)
  }
}

const ordinaryOwnData = (value: unknown, code: ContractCode): OwnData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code)
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) invalid(code)
    return Object.getOwnPropertyDescriptors(value)
  } catch (error) {
    if (error instanceof CardWorkspaceContractError) throw error
    invalid(code)
  }
}

const ownValue = (source: OwnData, key: string): unknown => source[key]?.value

const requireExactKeys = (source: OwnData, expected: readonly string[], code: ContractCode): void => {
  const keys = Object.keys(source).sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== [...expected].sort()[index])) invalid(code)
  if (keys.some((key) => !('value' in source[key]))) invalid(code)
}

const requiredString = (source: OwnData, key: string, code: ContractCode): string => {
  const value = ownValue(source, key)
  return typeof value === 'string' && value.length > 0 ? value : invalid(code)
}

const nullableString = (source: OwnData, key: string, code: ContractCode): string | null => {
  const value = ownValue(source, key)
  return value === null || typeof value === 'string' ? value : invalid(code)
}

const nullableInteger = (source: OwnData, key: string, minimum: number, maximum: number, code: ContractCode): number | null => {
  const value = ownValue(source, key)
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum)
    ? value
    : invalid(code)
}

const enumString = <T extends string>(source: OwnData, key: string, allowed: readonly T[], code: ContractCode): T => {
  const value = ownValue(source, key)
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : invalid(code)
}

const decimalMinor = (source: OwnData, key: string, code: ContractCode): string => {
  const value = ownValue(source, key)
  return typeof value === 'string' && /^-?[0-9]+$/.test(value) ? value : invalid(code)
}

const nullableUnsignedMinor = (source: OwnData, key: string, code: ContractCode): string | null => {
  const value = ownValue(source, key)
  return value === null || (typeof value === 'string' && /^[0-9]+$/.test(value)) ? value : invalid(code)
}

const currency = (source: OwnData, code: ContractCode): string => {
  const value = requiredString(source, 'currency', code)
  return /^[A-Z]{3}$/.test(value) ? value : invalid(code)
}

const timestamp = (source: OwnData, key: string, code: ContractCode): string => {
  const value = requiredString(source, key, code)
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value ? value : invalid(code)
}

const publicBalance = (value: unknown, expectedCardId: string): AdminCardBalance => {
  const source = ordinaryOwnData(value, 'INVALID_CARD_BALANCE')
  requireExactKeys(source, ['cardId', 'availableBalanceMinor', 'currentBalanceMinor', 'pendingAmountMinor', 'currency', 'asOf'], 'INVALID_CARD_BALANCE')
  const cardId = requiredString(source, 'cardId', 'INVALID_CARD_BALANCE')
  if (cardId !== expectedCardId) invalid('CARD_ID_MISMATCH')
  return Object.freeze({
    cardId,
    availableBalanceMinor: decimalMinor(source, 'availableBalanceMinor', 'INVALID_CARD_BALANCE'),
    currentBalanceMinor: decimalMinor(source, 'currentBalanceMinor', 'INVALID_CARD_BALANCE'),
    pendingAmountMinor: decimalMinor(source, 'pendingAmountMinor', 'INVALID_CARD_BALANCE'),
    currency: currency(source, 'INVALID_CARD_BALANCE'),
    asOf: timestamp(source, 'asOf', 'INVALID_CARD_BALANCE'),
  })
}

const publicCard = (
  value: unknown,
  expectedCardId: string,
  expectedEnvironment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
): AdminCardDetail => {
  const source = ordinaryOwnData(value, 'INVALID_CARD_DETAIL')
  requireExactKeys(source, [
    'id', 'customerId', 'environment', 'type', 'status', 'maskedPan', 'last4',
    'expiryMonth', 'expiryYear', 'currency', 'alias', 'createdAt', 'updatedAt',
  ], 'INVALID_CARD_DETAIL')
  const id = requiredString(source, 'id', 'INVALID_CARD_DETAIL')
  if (id !== expectedCardId) invalid('CARD_ID_MISMATCH')
  const environment = enumString(source, 'environment', ['SANDBOX', 'TEST'] as const, 'INVALID_CARD_DETAIL')
  if (environment !== expectedEnvironment) invalid('INVALID_CARD_DETAIL')
  const maskedPan = nullableString(source, 'maskedPan', 'INVALID_CARD_DETAIL')
  if (maskedPan !== null && !/^\*{12}[0-9]{4}$/.test(maskedPan)) invalid('INVALID_CARD_DETAIL')
  const last4 = nullableString(source, 'last4', 'INVALID_CARD_DETAIL')
  if (last4 !== null && !/^[0-9]{4}$/.test(last4)) invalid('INVALID_CARD_DETAIL')
  return Object.freeze({
    id,
    customerId: requiredString(source, 'customerId', 'INVALID_CARD_DETAIL'),
    environment,
    type: enumString(source, 'type', ['VIRTUAL', 'PHYSICAL'] as const, 'INVALID_CARD_DETAIL'),
    status: enumString(source, 'status', ['PENDING', 'ACTIVE', 'FROZEN', 'CLOSED', 'FAILED'] as const, 'INVALID_CARD_DETAIL'),
    maskedPan,
    last4,
    expiryMonth: nullableInteger(source, 'expiryMonth', 1, 12, 'INVALID_CARD_DETAIL'),
    expiryYear: nullableInteger(source, 'expiryYear', 2000, 9999, 'INVALID_CARD_DETAIL'),
    currency: currency(source, 'INVALID_CARD_DETAIL'),
    alias: nullableString(source, 'alias', 'INVALID_CARD_DETAIL'),
    createdAt: timestamp(source, 'createdAt', 'INVALID_CARD_DETAIL'),
    updatedAt: timestamp(source, 'updatedAt', 'INVALID_CARD_DETAIL'),
  })
}

const publicLimits = (value: unknown, expectedCardId: string): AdminCardLimits => {
  const source = ordinaryOwnData(value, 'INVALID_CARD_LIMITS')
  requireExactKeys(source, [
    'cardId', 'singleTransactionMinor', 'dailySpendMinor', 'monthlySpendMinor', 'dailyAtmMinor', 'asOf',
  ], 'INVALID_CARD_LIMITS')
  const cardId = requiredString(source, 'cardId', 'INVALID_CARD_LIMITS')
  if (cardId !== expectedCardId) invalid('CARD_ID_MISMATCH')
  const asOf = ownValue(source, 'asOf')
  return Object.freeze({
    cardId,
    singleTransactionMinor: nullableUnsignedMinor(source, 'singleTransactionMinor', 'INVALID_CARD_LIMITS'),
    dailySpendMinor: nullableUnsignedMinor(source, 'dailySpendMinor', 'INVALID_CARD_LIMITS'),
    monthlySpendMinor: nullableUnsignedMinor(source, 'monthlySpendMinor', 'INVALID_CARD_LIMITS'),
    dailyAtmMinor: nullableUnsignedMinor(source, 'dailyAtmMinor', 'INVALID_CARD_LIMITS'),
    asOf: asOf === null ? null : timestamp(source, 'asOf', 'INVALID_CARD_LIMITS'),
  })
}

export const adminCardSnapshotSessionScope = (
  actorId: string,
  sessionExpiresAt: string,
  homeTenantId: string,
  routeTenantId: string,
  sessionEnvironment: DataSource,
  runtimeEnvironment: string,
  sessionMarker: string,
  now = Date.now(),
): string | null => {
  if (
    ![actorId, homeTenantId, routeTenantId, sessionMarker].every((value) => typeof value === 'string' && value.length >= 2 && value.length <= 128)
    || homeTenantId !== routeTenantId
    || (sessionEnvironment !== 'SANDBOX' && sessionEnvironment !== 'TEST')
    || sessionEnvironment !== runtimeEnvironment
  ) return null
  const expiry = Date.parse(sessionExpiresAt)
  if (!Number.isFinite(expiry) || expiry <= now) return null
  return JSON.stringify([actorId, sessionExpiresAt, homeTenantId, routeTenantId, sessionEnvironment, sessionMarker])
}

export const adminCardSnapshotFailurePolicy = (error: unknown): Readonly<{
  retainSnapshot: boolean
  invalidateSession: boolean
}> => {
  let status: number | null = null
  try {
    if (error && typeof error === 'object') {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'status')
      if (descriptor && 'value' in descriptor && typeof descriptor.value === 'number') status = descriptor.value
    }
  } catch {}
  return Object.freeze({
    retainSnapshot: status === 0 || status === 408 || (status !== null && status >= 500 && status <= 599),
    invalidateSession: status === 401,
  })
}

export const cardWorkspaceBaseScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  mode: CardWorkspaceMode,
): string => [actorId, sessionExpiresAt, tenantId, environment, mode].join('\u0000')

export const cardWorkspaceRequestScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  mode: CardWorkspaceMode,
  cardId: string,
  action: CardWorkspaceAction,
): string => [cardWorkspaceBaseScope(actorId, sessionExpiresAt, tenantId, environment, mode), cardId, action].join('\u0000')

export function parseCardWorkspaceResponse(
  action: CardWorkspaceResponseAction,
  wireValue: unknown,
  expectedCardId: string,
  expectedEnvironment: Extract<DataSource, 'SANDBOX' | 'TEST'> = 'SANDBOX',
): CardWorkspaceView {
  const code: ContractCode = action === 'history'
    ? 'INVALID_CARD_TIMELINE'
    : action === 'balance'
      ? 'INVALID_CARD_BALANCE'
      : action === 'limits'
        ? 'INVALID_CARD_LIMITS'
      : 'INVALID_CARD_DETAIL'
  if (action === 'history') {
    const page = parseAdminCardTimelinePage(wireValue)
    return {
      kind: 'TIMELINE',
      value: [...page.events],
      empty: page.events.length === 0,
      truncated: page.nextCursor !== null,
    }
  }
  const value = boundedJson(wireValue, code)
  if (action === 'balance') {
    return { kind: 'BALANCE', value: publicBalance(value, expectedCardId), empty: false, truncated: false }
  }
  if (action === 'limits') {
    return { kind: 'LIMITS', value: publicLimits(value, expectedCardId), empty: false, truncated: false }
  }
  return { kind: 'CARD', value: publicCard(value, expectedCardId, expectedEnvironment), empty: false, truncated: false }
}
