import {
  MAX_ADMIN_CARD_TIMELINE_CURSOR_LENGTH,
  isCanonicalSignedAdminCardTimelineCursor,
  type DataSource,
} from './adminRoutes.ts'

export { MAX_ADMIN_CARD_TIMELINE_CURSOR_LENGTH, isCanonicalSignedAdminCardTimelineCursor } from './adminRoutes.ts'

export const ADMIN_CARD_TIMELINE_TYPES = Object.freeze([
  'CREATED',
  'ACTIVATED',
  'FROZEN',
  'UNFROZEN',
  'REPLACED',
  'RENEWED',
  'LIMITS_UPDATED',
  'PIN_UPDATED',
  'VIEWED',
  'STATUS_CHANGED',
  'UPDATED',
] as const)
export const ADMIN_CARD_TIMELINE_STATUSES = Object.freeze([
  'PENDING',
  'ACTIVE',
  'FROZEN',
  'CLOSED',
  'FAILED',
] as const)
export const ADMIN_CARD_TIMELINE_PUBLIC_FIELDS = Object.freeze([
  'id',
  'type',
  'fromStatus',
  'toStatus',
  'occurredAt',
] as const)
export const ADMIN_CARD_TIMELINE_PAGE_FIELDS = Object.freeze(['events', 'nextCursor'] as const)
export const MAX_ADMIN_CARD_TIMELINE_PAGE_SIZE = 25
export const MAX_ADMIN_CARD_TIMELINE_PAGES = 10
export const MAX_ADMIN_CARD_TIMELINE_ITEMS = 250
export const MAX_ADMIN_CARD_TIMELINE_JSON_BYTES = 262_144
export const MAX_ADMIN_CARD_TIMELINE_JSON_DEPTH = 16

export type AdminCardTimelineType = (typeof ADMIN_CARD_TIMELINE_TYPES)[number]
export type AdminCardTimelineStatus = (typeof ADMIN_CARD_TIMELINE_STATUSES)[number]
export type AdminCardTimelineEnvironment = Extract<DataSource, 'SANDBOX' | 'TEST'>

export type AdminCardTimelineEvent = Readonly<{
  id: string
  type: AdminCardTimelineType
  fromStatus: AdminCardTimelineStatus | null
  toStatus: AdminCardTimelineStatus | null
  occurredAt: string
}>

export type AdminCardTimelinePage = Readonly<{
  events: readonly AdminCardTimelineEvent[]
  nextCursor: string | null
}>

export type AdminCardTimelineFeed = Readonly<{
  scope: string
  events: readonly AdminCardTimelineEvent[]
  nextCursor: string | null
  seenIds: readonly string[]
  usedCursors: readonly string[]
  pageCount: number
  truncated: boolean
}>

type ContractCode =
  | 'INVALID_TIMELINE_PAGE'
  | 'INVALID_TIMELINE_EVENT'
  | 'PAGE_SIZE_EXCEEDED'
  | 'DUPLICATE_EVENT_ID'
  | 'CURSOR_LOOP'
  | 'CURSOR_MISMATCH'
  | 'NON_MONOTONIC_ORDER'
  | 'TIMELINE_SCOPE_MISMATCH'
  | 'TIMELINE_PAGE_LIMIT'

export class CardTimelineContractError extends Error {
  readonly code: ContractCode

  constructor(code: ContractCode) {
    super({
      INVALID_TIMELINE_PAGE: 'Card timeline response could not be verified',
      INVALID_TIMELINE_EVENT: 'Card timeline event could not be verified',
      PAGE_SIZE_EXCEEDED: 'Card timeline page exceeds the allowed size',
      DUPLICATE_EVENT_ID: 'Card timeline pagination returned a duplicate event',
      CURSOR_LOOP: 'Card timeline pagination returned a cursor loop',
      CURSOR_MISMATCH: 'Card timeline pagination cursor does not match the current page',
      NON_MONOTONIC_ORDER: 'Card timeline events are not in the expected order',
      TIMELINE_SCOPE_MISMATCH: 'Card timeline response does not match the current Admin scope',
      TIMELINE_PAGE_LIMIT: 'Card timeline pagination exceeded the local page limit',
    }[code])
    this.code = code
    this.name = 'CardTimelineContractError'
  }
}

type OwnData = Readonly<Record<string, PropertyDescriptor>>
const invalid = (code: ContractCode): never => { throw new CardTimelineContractError(code) }

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
      if (depth > MAX_ADMIN_CARD_TIMELINE_JSON_DEPTH) return false
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return !inString && !escaped && depth === 0
}

const boundedJson = (wireValue: unknown): unknown => {
  if (typeof wireValue !== 'string' || wireValue.length === 0) invalid('INVALID_TIMELINE_PAGE')
  if (wireValue.length > MAX_ADMIN_CARD_TIMELINE_JSON_BYTES) invalid('INVALID_TIMELINE_PAGE')
  if (new TextEncoder().encode(wireValue).byteLength > MAX_ADMIN_CARD_TIMELINE_JSON_BYTES) invalid('INVALID_TIMELINE_PAGE')
  if (!jsonDepthWithinLimit(wireValue)) invalid('INVALID_TIMELINE_PAGE')
  try {
    return JSON.parse(wireValue) as unknown
  } catch {
    return invalid('INVALID_TIMELINE_PAGE')
  }
}

const ownData = (value: unknown, code: ContractCode): OwnData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code)
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) invalid(code)
    return Object.getOwnPropertyDescriptors(value)
  } catch (error) {
    if (error instanceof CardTimelineContractError) throw error
    return invalid(code)
  }
}

const ownValue = (source: OwnData, key: string): unknown => source[key]?.value

const exactFields = (source: OwnData, fields: readonly string[], code: ContractCode): void => {
  const keys = Object.keys(source).sort()
  const expected = [...fields].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid(code)
  if (keys.some((key) => !('value' in source[key]))) invalid(code)
}

const requiredText = (source: OwnData, key: string, maximum: number, code: ContractCode): string => {
  const value = ownValue(source, key)
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximum
    || new TextEncoder().encode(value).byteLength > maximum
    || [...value].some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f)
  ) invalid(code)
  return value
}

const status = (source: OwnData, key: string): AdminCardTimelineStatus | null => {
  const value = ownValue(source, key)
  if (value === null) return null
  return typeof value === 'string' && (ADMIN_CARD_TIMELINE_STATUSES as readonly string[]).includes(value)
    ? value as AdminCardTimelineStatus
    : invalid('INVALID_TIMELINE_EVENT')
}

const occurredAt = (source: OwnData): string => {
  const value = requiredText(source, 'occurredAt', 32, 'INVALID_TIMELINE_EVENT')
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : invalid('INVALID_TIMELINE_EVENT')
}

const publicEvent = (value: unknown): AdminCardTimelineEvent => {
  const source = ownData(value, 'INVALID_TIMELINE_EVENT')
  exactFields(source, ADMIN_CARD_TIMELINE_PUBLIC_FIELDS, 'INVALID_TIMELINE_EVENT')
  const id = requiredText(source, 'id', 128, 'INVALID_TIMELINE_EVENT')
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(id)) invalid('INVALID_TIMELINE_EVENT')
  const type = requiredText(source, 'type', 32, 'INVALID_TIMELINE_EVENT')
  if (!(ADMIN_CARD_TIMELINE_TYPES as readonly string[]).includes(type)) invalid('INVALID_TIMELINE_EVENT')
  return Object.freeze({
    id,
    type: type as AdminCardTimelineType,
    fromStatus: status(source, 'fromStatus'),
    toStatus: status(source, 'toStatus'),
    occurredAt: occurredAt(source),
  })
}

const nextCursor = (value: unknown): string | null => {
  if (value === null) return null
  return isCanonicalSignedAdminCardTimelineCursor(value)
    ? value
    : invalid('INVALID_TIMELINE_PAGE')
}

const cursorPosition = (cursor: string): Readonly<{ id: string; occurredAt: string }> => {
  try {
    const encoded = cursor.split('.')[0]
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { i: string; t: string }
    return Object.freeze({ id: payload.i, occurredAt: payload.t })
  } catch {
    return invalid('INVALID_TIMELINE_PAGE')
  }
}

const outOfOrder = (left: AdminCardTimelineEvent, right: AdminCardTimelineEvent): boolean =>
  Date.parse(right.occurredAt) > Date.parse(left.occurredAt)

export function parseAdminCardTimelinePage(wireValue: unknown): AdminCardTimelinePage {
  const source = ownData(boundedJson(wireValue), 'INVALID_TIMELINE_PAGE')
  exactFields(source, ADMIN_CARD_TIMELINE_PAGE_FIELDS, 'INVALID_TIMELINE_PAGE')
  const rawEvents = ownValue(source, 'events')
  if (!Array.isArray(rawEvents)) invalid('INVALID_TIMELINE_PAGE')
  if (rawEvents.length > MAX_ADMIN_CARD_TIMELINE_PAGE_SIZE) invalid('PAGE_SIZE_EXCEEDED')
  const events = rawEvents.map(publicEvent)
  const ids = new Set<string>()
  for (let index = 0; index < events.length; index += 1) {
    if (ids.has(events[index].id)) invalid('DUPLICATE_EVENT_ID')
    ids.add(events[index].id)
    if (index > 0 && outOfOrder(events[index - 1], events[index])) invalid('NON_MONOTONIC_ORDER')
  }
  const cursor = nextCursor(ownValue(source, 'nextCursor'))
  if (events.length === 0 && cursor !== null) invalid('INVALID_TIMELINE_PAGE')
  if (cursor !== null) {
    const position = cursorPosition(cursor)
    const last = events.at(-1)!
    if (position.id !== last.id || position.occurredAt !== last.occurredAt) invalid('CURSOR_MISMATCH')
  }
  return Object.freeze({ events: Object.freeze(events), nextCursor: cursor })
}

export const createAdminCardTimelineFeed = (scope: string): AdminCardTimelineFeed => Object.freeze({
  scope,
  events: Object.freeze([]),
  nextCursor: null,
  seenIds: Object.freeze([]),
  usedCursors: Object.freeze([]),
  pageCount: 0,
  truncated: false,
})

export function appendAdminCardTimelinePage(
  feed: AdminCardTimelineFeed,
  page: AdminCardTimelinePage,
  requestedCursor: string | null,
  currentScope: string,
): AdminCardTimelineFeed {
  if (feed.scope !== currentScope) invalid('TIMELINE_SCOPE_MISMATCH')
  if (feed.pageCount > 0 && feed.nextCursor === null) invalid('CURSOR_MISMATCH')
  if (feed.nextCursor !== requestedCursor) invalid('CURSOR_MISMATCH')
  if (requestedCursor !== null && feed.usedCursors.includes(requestedCursor)) invalid('CURSOR_LOOP')
  const pageCount = feed.pageCount + 1
  if (pageCount > MAX_ADMIN_CARD_TIMELINE_PAGES) invalid('TIMELINE_PAGE_LIMIT')
  if (feed.events.length > 0 && page.events.length > 0 && outOfOrder(feed.events.at(-1)!, page.events[0])) {
    invalid('NON_MONOTONIC_ORDER')
  }
  const seenIds = new Set(feed.seenIds)
  for (const event of page.events) {
    if (seenIds.has(event.id)) invalid('DUPLICATE_EVENT_ID')
    seenIds.add(event.id)
  }
  const usedCursors = new Set(feed.usedCursors)
  if (requestedCursor !== null) usedCursors.add(requestedCursor)
  if (page.nextCursor !== null && (page.nextCursor === requestedCursor || usedCursors.has(page.nextCursor))) invalid('CURSOR_LOOP')
  const events = [...feed.events, ...page.events]
  if (events.length > MAX_ADMIN_CARD_TIMELINE_ITEMS) invalid('TIMELINE_PAGE_LIMIT')
  const boundReached = pageCount === MAX_ADMIN_CARD_TIMELINE_PAGES || events.length === MAX_ADMIN_CARD_TIMELINE_ITEMS
  return Object.freeze({
    scope: currentScope,
    events: Object.freeze(events),
    nextCursor: boundReached ? null : page.nextCursor,
    seenIds: Object.freeze([...seenIds]),
    usedCursors: Object.freeze([...usedCursors]),
    pageCount,
    truncated: feed.truncated || Boolean(boundReached && page.nextCursor),
  })
}

export const cardTimelineCollectionScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  cardId: string,
): string => JSON.stringify([
  actorId,
  sessionExpiresAt,
  tenantId,
  environment,
  cardId,
  'timeline',
  String(MAX_ADMIN_CARD_TIMELINE_PAGE_SIZE),
])

export const cardTimelineRequestScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  cardId: string,
): string => JSON.stringify([
  cardTimelineCollectionScope(actorId, sessionExpiresAt, tenantId, environment, cardId),
  'atomic-refresh',
])

export const cardTimelineSessionReadAllowed = (
  actorId: string,
  sessionExpiresAt: string,
  environment: DataSource,
  now = Date.now(),
): environment is AdminCardTimelineEnvironment => {
  const expiry = Date.parse(sessionExpiresAt)
  return (environment === 'SANDBOX' || environment === 'TEST')
    && /^[A-Za-z0-9._:-]{2,256}$/.test(actorId)
    && Number.isFinite(expiry)
    && expiry > now
}

export const cardTimelineShouldClearSnapshot = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  try {
    const status = Object.getOwnPropertyDescriptor(error, 'status')
    return Boolean(
      status
      && 'value' in status
      && (status.value === 401 || status.value === 403 || status.value === 404),
    )
  } catch {
    return false
  }
}

export function adminCardTimelineContractEvidence(sourceCommit: string) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_SHA must be a lowercase 40-character commit SHA')
  return Object.freeze({
    format: 'fastlink-admin-card-timeline-contract-v1',
    sourceCommit,
    environment: 'NON_PRODUCTION',
    runtimeEnvironments: Object.freeze(['SANDBOX', 'TEST']),
    productionEnabled: false,
    method: 'GET',
    authentication: 'ADMIN_BEARER_MEMORY_ONLY',
    credentialsMode: 'omit',
    csrfRequired: false,
    pageSize: MAX_ADMIN_CARD_TIMELINE_PAGE_SIZE,
    maximumPages: MAX_ADMIN_CARD_TIMELINE_PAGES,
    maximumItems: MAX_ADMIN_CARD_TIMELINE_ITEMS,
    exactPageFields: Object.freeze([...ADMIN_CARD_TIMELINE_PAGE_FIELDS]),
    exactEventFields: Object.freeze([...ADMIN_CARD_TIMELINE_PUBLIC_FIELDS]),
    collectionScopeBindings: Object.freeze(['actorId', 'sessionExpiresAt', 'tenantId', 'environment', 'cardId']),
    requestGenerationBound: true,
    activeCancellationRequired: true,
    atomicRefresh: true,
    clearSnapshotOnCurrentStatus: Object.freeze([401, 403, 404]),
    staleCompletionWrites: 0,
    providerCalls: 0,
    businessWrites: 0,
  })
}
