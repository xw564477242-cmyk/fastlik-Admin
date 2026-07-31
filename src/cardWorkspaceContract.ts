import type { DataSource } from './adminRoutes'

export type CardWorkspaceMode = 'card' | 'history'
export type CardWorkspaceAction = 'read' | 'balance' | 'freeze' | 'unfreeze' | 'history'

export type CardWorkspaceView = {
  kind: 'CARD' | 'BALANCE' | 'TIMELINE'
  value: Record<string, unknown> | Array<Record<string, unknown>>
  empty: boolean
  truncated: boolean
}

export const MAX_CARD_TIMELINE_ITEMS = 200

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} contract is invalid`)
  return value as Record<string, unknown>
}

const string = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value) throw new Error(`${label} contract is invalid`)
  return value
}

const optionalScalar = (target: Record<string, unknown>, source: Record<string, unknown>, key: string): void => {
  const value = source[key]
  if (value === undefined) return
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    target[key] = value
  }
}

const publicBalance = (value: unknown): Record<string, unknown> => {
  const source = record(value, 'Card balance')
  const result: Record<string, unknown> = {}
  for (const key of ['availableBalanceMinor', 'currentBalanceMinor', 'pendingAmountMinor', 'currency', 'updatedAt']) {
    optionalScalar(result, source, key)
  }
  return result
}

const publicCard = (value: unknown, expectedCardId: string): Record<string, unknown> => {
  const source = record(value, 'Card')
  const id = string(source.id, 'Card ID')
  if (id !== expectedCardId) throw new Error('Card response does not match the requested Card ID')
  const result: Record<string, unknown> = { id }
  for (const key of ['type', 'status', 'last4', 'expiryMonth', 'expiryYear', 'currency', 'alias']) {
    optionalScalar(result, source, key)
  }
  if (source.balance !== undefined && source.balance !== null) result.balance = publicBalance(source.balance)
  return result
}

const publicTimeline = (value: unknown, expectedCardId: string): CardWorkspaceView => {
  if (!Array.isArray(value)) throw new Error('Card timeline contract is invalid')
  const items = value.slice(0, MAX_CARD_TIMELINE_ITEMS).map((entry) => {
    const source = record(entry, 'Card timeline item')
    if (source.cardId !== undefined && string(source.cardId, 'Timeline Card ID') !== expectedCardId) {
      throw new Error('Card timeline response does not match the requested Card ID')
    }
    const result: Record<string, unknown> = {}
    for (const key of ['kind', 'action', 'eventType', 'fromStatus', 'toStatus', 'source', 'createdAt']) {
      optionalScalar(result, source, key)
    }
    return result
  })
  return { kind: 'TIMELINE', value: items, empty: items.length === 0, truncated: value.length > items.length }
}

export const cardWorkspaceBaseScope = (
  actorId: string,
  tenantId: string,
  environment: DataSource,
  mode: CardWorkspaceMode,
): string => [actorId, tenantId, environment, mode].join('\u0000')

export const cardWorkspaceRequestScope = (
  actorId: string,
  tenantId: string,
  environment: DataSource,
  mode: CardWorkspaceMode,
  cardId: string,
  action: CardWorkspaceAction,
): string => [cardWorkspaceBaseScope(actorId, tenantId, environment, mode), cardId, action].join('\u0000')

export function parseCardWorkspaceResponse(
  action: CardWorkspaceAction,
  value: unknown,
  expectedCardId: string,
): CardWorkspaceView {
  if (action === 'history') return publicTimeline(value, expectedCardId)
  if (action === 'balance') {
    const source = record(value, 'Card balance')
    if (source.cardId !== undefined && string(source.cardId, 'Balance Card ID') !== expectedCardId) {
      throw new Error('Card balance response does not match the requested Card ID')
    }
    return { kind: 'BALANCE', value: publicBalance(source), empty: false, truncated: false }
  }
  return { kind: 'CARD', value: publicCard(value, expectedCardId), empty: false, truncated: false }
}
