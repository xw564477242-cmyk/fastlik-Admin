import type { DataSource } from './adminRoutes'

export type CardWorkspaceMode = 'card' | 'history'
export type CardWorkspaceAction = 'read' | 'balance' | 'freeze' | 'unfreeze' | 'history'

export type AdminCardType = 'VIRTUAL' | 'PHYSICAL'
export type AdminCardStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'CLOSED' | 'FAILED'

export type AdminCardBalance = Readonly<{
  availableBalanceMinor: string
  currentBalanceMinor: string
  pendingAmountMinor: string
  currency: string
  updatedAt: string
}>

export type AdminCardDetail = Readonly<{
  id: string
  type: AdminCardType
  status: AdminCardStatus
  last4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  currency: string
  alias: string | null
  balance: AdminCardBalance | null
}>

export type CardTimelineItem = Readonly<{
  kind?: string | number | boolean | null
  action?: string | number | boolean | null
  eventType?: string | number | boolean | null
  fromStatus?: string | number | boolean | null
  toStatus?: string | number | boolean | null
  source?: string | number | boolean | null
  createdAt?: string | number | boolean | null
}>

export type CardWorkspaceView =
  | { kind: 'CARD'; value: AdminCardDetail; empty: false; truncated: false }
  | { kind: 'BALANCE'; value: AdminCardBalance; empty: false; truncated: false }
  | { kind: 'TIMELINE'; value: CardTimelineItem[]; empty: boolean; truncated: boolean }

export type CardWorkspaceDisplayState = {
  cardId: string
  view: CardWorkspaceView | null
  busy: string
  error: string
}

export const MAX_CARD_TIMELINE_ITEMS = 200
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
  readonly code: 'INVALID_CARD_DETAIL' | 'INVALID_CARD_BALANCE' | 'INVALID_CARD_TIMELINE' | 'CARD_ID_MISMATCH'

  constructor(code: 'INVALID_CARD_DETAIL' | 'INVALID_CARD_BALANCE' | 'INVALID_CARD_TIMELINE' | 'CARD_ID_MISMATCH') {
    super({
      INVALID_CARD_DETAIL: 'Card detail response could not be verified',
      INVALID_CARD_BALANCE: 'Card balance response could not be verified',
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

const boundedJson = (wireValue: unknown, code: ContractCode): unknown => {
  if (typeof wireValue !== 'string' || wireValue.length === 0) invalid(code)
  // UTF-8 is never shorter than the number of UTF-16 code units for valid JSON.
  // Reject obviously oversized input before allocating an encoded copy.
  if (wireValue.length > MAX_CARD_WORKSPACE_JSON_BYTES) invalid(code)
  if (new TextEncoder().encode(wireValue).byteLength > MAX_CARD_WORKSPACE_JSON_BYTES) invalid(code)
  if (!jsonDepthWithinLimit(wireValue)) invalid(code)
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
const hasOwnValue = (source: OwnData, key: string): boolean => Boolean(source[key])

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

const currency = (source: OwnData, code: ContractCode): string => {
  const value = requiredString(source, 'currency', code)
  return /^[A-Z]{3}$/.test(value) ? value : invalid(code)
}

const timestamp = (source: OwnData, code: ContractCode): string => {
  const value = requiredString(source, 'updatedAt', code)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ? value : invalid(code)
}

const publicBalance = (value: unknown): AdminCardBalance => {
  const source = ordinaryOwnData(value, 'INVALID_CARD_BALANCE')
  return Object.freeze({
    availableBalanceMinor: decimalMinor(source, 'availableBalanceMinor', 'INVALID_CARD_BALANCE'),
    currentBalanceMinor: decimalMinor(source, 'currentBalanceMinor', 'INVALID_CARD_BALANCE'),
    pendingAmountMinor: decimalMinor(source, 'pendingAmountMinor', 'INVALID_CARD_BALANCE'),
    currency: currency(source, 'INVALID_CARD_BALANCE'),
    updatedAt: timestamp(source, 'INVALID_CARD_BALANCE'),
  })
}

const publicCard = (value: unknown, expectedCardId: string): AdminCardDetail => {
  const source = ordinaryOwnData(value, 'INVALID_CARD_DETAIL')
  const id = requiredString(source, 'id', 'INVALID_CARD_DETAIL')
  if (id !== expectedCardId) invalid('CARD_ID_MISMATCH')
  const last4 = nullableString(source, 'last4', 'INVALID_CARD_DETAIL')
  if (last4 !== null && !/^[0-9]{4}$/.test(last4)) invalid('INVALID_CARD_DETAIL')
  const rawBalance = ownValue(source, 'balance')
  return Object.freeze({
    id,
    type: enumString(source, 'type', ['VIRTUAL', 'PHYSICAL'] as const, 'INVALID_CARD_DETAIL'),
    status: enumString(source, 'status', ['PENDING', 'ACTIVE', 'FROZEN', 'CLOSED', 'FAILED'] as const, 'INVALID_CARD_DETAIL'),
    last4,
    expiryMonth: nullableInteger(source, 'expiryMonth', 1, 12, 'INVALID_CARD_DETAIL'),
    expiryYear: nullableInteger(source, 'expiryYear', 2000, 9999, 'INVALID_CARD_DETAIL'),
    currency: currency(source, 'INVALID_CARD_DETAIL'),
    alias: nullableString(source, 'alias', 'INVALID_CARD_DETAIL'),
    balance: rawBalance === null ? null : publicBalance(rawBalance),
  })
}

const optionalScalar = (target: CardTimelineItem, source: OwnData, key: keyof CardTimelineItem): void => {
  if (!hasOwnValue(source, key)) return
  const value = ownValue(source, key)
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    ;(target as Record<string, unknown>)[key] = value
  }
}

const publicTimeline = (value: unknown, expectedCardId: string): CardWorkspaceView => {
  if (!Array.isArray(value)) invalid('INVALID_CARD_TIMELINE')
  const items = value.slice(0, MAX_CARD_TIMELINE_ITEMS).map((entry) => {
    const source = ordinaryOwnData(entry, 'INVALID_CARD_TIMELINE')
    if (hasOwnValue(source, 'cardId')) {
      const cardId = requiredString(source, 'cardId', 'INVALID_CARD_TIMELINE')
      if (cardId !== expectedCardId) invalid('CARD_ID_MISMATCH')
    }
    const result: CardTimelineItem = {}
    for (const key of ['kind', 'action', 'eventType', 'fromStatus', 'toStatus', 'source', 'createdAt'] as const) {
      optionalScalar(result, source, key)
    }
    return Object.freeze(result)
  })
  return { kind: 'TIMELINE', value: items, empty: items.length === 0, truncated: value.length > items.length }
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
  action: CardWorkspaceAction,
  wireValue: unknown,
  expectedCardId: string,
): CardWorkspaceView {
  const code: ContractCode = action === 'history'
    ? 'INVALID_CARD_TIMELINE'
    : action === 'balance'
      ? 'INVALID_CARD_BALANCE'
      : 'INVALID_CARD_DETAIL'
  const value = boundedJson(wireValue, code)
  if (action === 'history') return publicTimeline(value, expectedCardId)
  if (action === 'balance') {
    const source = ordinaryOwnData(value, 'INVALID_CARD_BALANCE')
    if (hasOwnValue(source, 'cardId') && requiredString(source, 'cardId', 'INVALID_CARD_BALANCE') !== expectedCardId) {
      invalid('CARD_ID_MISMATCH')
    }
    return { kind: 'BALANCE', value: publicBalance(value), empty: false, truncated: false }
  }
  return { kind: 'CARD', value: publicCard(value, expectedCardId), empty: false, truncated: false }
}
