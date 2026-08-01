import {
  ADMIN_CARD_TRANSACTION_STATUSES,
  ADMIN_CARD_TRANSACTION_STATUS_FILTERS,
  ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE,
  ADMIN_CARD_TRANSACTION_TYPES,
  MAX_ADMIN_CARD_TRANSACTION_CURSOR_LENGTH,
  isCanonicalSignedAdminCardTransactionCursor,
  type AdminCardTransactionQuery,
  type AdminCardTransactionStatus,
  type AdminCardTransactionType,
  type DataSource,
} from './adminRoutes.ts'

export { ADMIN_CARD_TRANSACTION_STATUSES, ADMIN_CARD_TRANSACTION_STATUS_FILTERS, ADMIN_CARD_TRANSACTION_TYPES } from './adminRoutes.ts'

export const MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE = 25
export const MAX_ADMIN_CARD_TRANSACTION_HISTORY_ITEMS = 500
export const MAX_CARD_TRANSACTION_JSON_BYTES = 262_144
export const MAX_CARD_TRANSACTION_JSON_DEPTH = 16
export const ADMIN_CARD_TRANSACTION_PUBLIC_FIELDS = Object.freeze([
  'id',
  'status',
  'type',
  'amountMinor',
  'authorizedAmountMinor',
  'clearedAmountMinor',
  'settledAmountMinor',
  'reversedAmountMinor',
  'refundedAmountMinor',
  'currency',
  'merchantName',
  'merchantCategory',
  'occurredAt',
] as const)
const ADMIN_CARD_TRANSACTION_PAGE_FIELDS = Object.freeze(['data', 'nextCursor'] as const)

export type AdminCardTransaction = Readonly<{
  id: string
  status: AdminCardTransactionStatus
  type: AdminCardTransactionType
  amountMinor: string
  authorizedAmountMinor: string
  clearedAmountMinor: string
  settledAmountMinor: string
  reversedAmountMinor: string
  refundedAmountMinor: string
  currency: string
  merchantName: string | null
  merchantCategory: string | null
  occurredAt: string
}>

export type AdminCardTransactionPage = Readonly<{
  transactions: readonly AdminCardTransaction[]
  nextCursor: string | null
}>

export type AdminCardTransactionFeed = Readonly<{
  scope: string
  transactions: readonly AdminCardTransaction[]
  nextCursor: string | null
  seenIds: readonly string[]
  usedCursors: readonly string[]
}>

type ContractCode =
  | 'INVALID_TRANSACTION_PAGE'
  | 'INVALID_TRANSACTION'
  | 'PAGE_SIZE_EXCEEDED'
  | 'DUPLICATE_TRANSACTION_ID'
  | 'CURSOR_LOOP'
  | 'CURSOR_MISMATCH'
  | 'NON_MONOTONIC_ORDER'
  | 'TRANSACTION_SCOPE_MISMATCH'
  | 'TRANSACTION_HISTORY_LIMIT'

export class CardTransactionContractError extends Error {
  readonly code: ContractCode

  constructor(code: ContractCode) {
    super({
      INVALID_TRANSACTION_PAGE: 'Card transaction response could not be verified',
      INVALID_TRANSACTION: 'Card transaction could not be verified',
      PAGE_SIZE_EXCEEDED: 'Card transaction page exceeds the allowed size',
      DUPLICATE_TRANSACTION_ID: 'Card transaction pagination returned a duplicate transaction',
      CURSOR_LOOP: 'Card transaction pagination returned a cursor loop',
      CURSOR_MISMATCH: 'Card transaction pagination cursor does not match the current page',
      NON_MONOTONIC_ORDER: 'Card transactions are not in the expected order',
      TRANSACTION_SCOPE_MISMATCH: 'Card transaction response does not match the current Admin scope',
      TRANSACTION_HISTORY_LIMIT: 'Card transaction history reached the local safety limit',
    }[code])
    this.code = code
    this.name = 'CardTransactionContractError'
  }
}

type OwnData = Readonly<Record<string, PropertyDescriptor>>
const invalid = (code: ContractCode): never => { throw new CardTransactionContractError(code) }

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
      if (depth > MAX_CARD_TRANSACTION_JSON_DEPTH) return false
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return !inString && !escaped && depth === 0
}

const boundedJson = (wireValue: unknown, code: ContractCode): unknown => {
  if (typeof wireValue !== 'string' || wireValue.length === 0) invalid(code)
  if (wireValue.length > MAX_CARD_TRANSACTION_JSON_BYTES) invalid(code)
  if (new TextEncoder().encode(wireValue).byteLength > MAX_CARD_TRANSACTION_JSON_BYTES) invalid(code)
  if (!jsonDepthWithinLimit(wireValue)) invalid(code)
  try {
    return JSON.parse(wireValue) as unknown
  } catch {
    return invalid(code)
  }
}

const ownData = (value: unknown, code: ContractCode): OwnData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code)
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid(code)
  return Object.getOwnPropertyDescriptors(value)
}

const ownValue = (source: OwnData, key: string): unknown => source[key]?.value

const exactFields = (source: OwnData, fields: readonly string[], code: ContractCode): void => {
  const keys = Object.keys(source).sort()
  const expected = [...fields].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid(code)
  if (keys.some((key) => !('value' in source[key]))) invalid(code)
}

const text = (source: OwnData, key: string, maxBytes: number, code: ContractCode): string => {
  const value = ownValue(source, key)
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxBytes
    || new TextEncoder().encode(value).byteLength > maxBytes
    || [...value].some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f)
  ) invalid(code)
  return value
}

const identifier = (source: OwnData, key: string, code: ContractCode): string => {
  const value = text(source, key, 128, code)
  return /^[A-Za-z0-9_-]{2,128}$/.test(value) ? value : invalid(code)
}

const minorUnits = (source: OwnData, key: string): string => {
  const value = ownValue(source, key)
  if (typeof value !== 'string' || !/^(0|-?[1-9][0-9]{0,18})$/.test(value)) invalid('INVALID_TRANSACTION')
  const amount = BigInt(value)
  return amount >= -9_223_372_036_854_775_808n && amount <= 9_223_372_036_854_775_807n
    ? value
    : invalid('INVALID_TRANSACTION')
}

const timestamp = (source: OwnData, key: string): string => {
  const value = text(source, key, 32, 'INVALID_TRANSACTION')
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : invalid('INVALID_TRANSACTION')
}

const nullableText = (source: OwnData, key: string, maxBytes: number): string | null => {
  const value = ownValue(source, key)
  if (value === null) return null
  return text(source, key, maxBytes, 'INVALID_TRANSACTION')
}

const publicTransaction = (value: unknown, query: AdminCardTransactionQuery): AdminCardTransaction => {
  const source = ownData(value, 'INVALID_TRANSACTION')
  exactFields(source, ADMIN_CARD_TRANSACTION_PUBLIC_FIELDS, 'INVALID_TRANSACTION')
  const status = text(source, 'status', 32, 'INVALID_TRANSACTION')
  if (!(ADMIN_CARD_TRANSACTION_STATUSES as readonly string[]).includes(status)) invalid('INVALID_TRANSACTION')
  const type = text(source, 'type', 32, 'INVALID_TRANSACTION')
  if (!(ADMIN_CARD_TRANSACTION_TYPES as readonly string[]).includes(type)) invalid('INVALID_TRANSACTION')
  if (ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE[type as AdminCardTransactionType] !== status) invalid('INVALID_TRANSACTION')
  if (query.status !== 'ALL' && status !== query.status) invalid('INVALID_TRANSACTION')
  if (query.type && type !== query.type) invalid('INVALID_TRANSACTION')
  const currency = text(source, 'currency', 3, 'INVALID_TRANSACTION')
  if (!/^[A-Z]{3}$/.test(currency)) invalid('INVALID_TRANSACTION')
  if (query.currency && currency !== query.currency) invalid('INVALID_TRANSACTION')
  const merchantCategory = nullableText(source, 'merchantCategory', 4)
  if (merchantCategory !== null && !/^[0-9]{4}$/.test(merchantCategory)) invalid('INVALID_TRANSACTION')
  const transaction = Object.freeze({
    id: identifier(source, 'id', 'INVALID_TRANSACTION'),
    status: status as AdminCardTransactionStatus,
    type: type as AdminCardTransactionType,
    amountMinor: minorUnits(source, 'amountMinor'),
    authorizedAmountMinor: minorUnits(source, 'authorizedAmountMinor'),
    clearedAmountMinor: minorUnits(source, 'clearedAmountMinor'),
    settledAmountMinor: minorUnits(source, 'settledAmountMinor'),
    reversedAmountMinor: minorUnits(source, 'reversedAmountMinor'),
    refundedAmountMinor: minorUnits(source, 'refundedAmountMinor'),
    currency,
    merchantName: nullableText(source, 'merchantName', 200),
    merchantCategory,
    occurredAt: timestamp(source, 'occurredAt'),
  })
  const occurredDate = transaction.occurredAt.slice(0, 10)
  if (query.from && occurredDate < query.from) invalid('INVALID_TRANSACTION')
  if (query.to && occurredDate > query.to) invalid('INVALID_TRANSACTION')
  return transaction
}

const nextCursor = (value: unknown): string | null => {
  if (value === null) return null
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ADMIN_CARD_TRANSACTION_CURSOR_LENGTH
    || !isCanonicalSignedAdminCardTransactionCursor(value)
  ) {
    invalid('INVALID_TRANSACTION_PAGE')
  }
  return value
}

const compareOrder = (left: AdminCardTransaction, right: AdminCardTransaction): number => {
  const time = Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
  return time === 0 ? right.id.localeCompare(left.id) : time
}

export const createCardTransactionFeed = (scope: string): AdminCardTransactionFeed => Object.freeze({
  scope,
  transactions: Object.freeze([]),
  nextCursor: null,
  seenIds: Object.freeze([]),
  usedCursors: Object.freeze([]),
})

export function parseAdminCardTransactionPage(
  wireValue: unknown,
  query: AdminCardTransactionQuery,
): AdminCardTransactionPage {
  const requestedLimit = query.limit
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_ADMIN_CARD_TRANSACTION_PAGE_SIZE) {
    invalid('PAGE_SIZE_EXCEEDED')
  }
  const source = ownData(boundedJson(wireValue, 'INVALID_TRANSACTION_PAGE'), 'INVALID_TRANSACTION_PAGE')
  exactFields(source, ADMIN_CARD_TRANSACTION_PAGE_FIELDS, 'INVALID_TRANSACTION_PAGE')
  const rawTransactions = ownValue(source, 'data')
  if (!Array.isArray(rawTransactions)) invalid('INVALID_TRANSACTION_PAGE')
  if (rawTransactions.length > requestedLimit) invalid('PAGE_SIZE_EXCEEDED')
  const transactions = rawTransactions.map((transaction) => publicTransaction(transaction, query))
  const ids = new Set<string>()
  for (let index = 0; index < transactions.length; index += 1) {
    if (ids.has(transactions[index].id)) invalid('DUPLICATE_TRANSACTION_ID')
    ids.add(transactions[index].id)
    if (index > 0 && compareOrder(transactions[index - 1], transactions[index]) >= 0) invalid('NON_MONOTONIC_ORDER')
  }
  const cursor = nextCursor(ownValue(source, 'nextCursor'))
  if (transactions.length === 0 && cursor !== null) invalid('INVALID_TRANSACTION_PAGE')
  return Object.freeze({ transactions: Object.freeze(transactions), nextCursor: cursor })
}

export function parseAdminCardTransactionDetail(
  wireValue: unknown,
  requestedTransactionId: string,
  query: AdminCardTransactionQuery,
): AdminCardTransaction {
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(requestedTransactionId)) invalid('INVALID_TRANSACTION')
  const transaction = publicTransaction(boundedJson(wireValue, 'INVALID_TRANSACTION'), query)
  return transaction.id === requestedTransactionId ? transaction : invalid('TRANSACTION_SCOPE_MISMATCH')
}

export function appendAdminCardTransactionPage(
  feed: AdminCardTransactionFeed,
  page: AdminCardTransactionPage,
  requestedCursor: string | null,
  currentScope: string,
): AdminCardTransactionFeed {
  if (feed.scope !== currentScope) invalid('TRANSACTION_SCOPE_MISMATCH')
  if (feed.nextCursor !== requestedCursor) invalid('CURSOR_MISMATCH')
  if (requestedCursor !== null && feed.usedCursors.includes(requestedCursor)) invalid('CURSOR_LOOP')
  const seenIds = new Set(feed.seenIds)
  if (feed.transactions.length > 0 && page.transactions.length > 0 && compareOrder(feed.transactions.at(-1)!, page.transactions[0]) >= 0) {
    invalid('NON_MONOTONIC_ORDER')
  }
  for (const transaction of page.transactions) {
    if (seenIds.has(transaction.id)) invalid('DUPLICATE_TRANSACTION_ID')
    seenIds.add(transaction.id)
  }
  const usedCursors = new Set(feed.usedCursors)
  if (requestedCursor !== null) usedCursors.add(requestedCursor)
  if (page.nextCursor !== null && (page.nextCursor === requestedCursor || usedCursors.has(page.nextCursor))) invalid('CURSOR_LOOP')
  const transactions = [...feed.transactions, ...page.transactions]
  if (transactions.length > MAX_ADMIN_CARD_TRANSACTION_HISTORY_ITEMS) invalid('TRANSACTION_HISTORY_LIMIT')
  return Object.freeze({
    scope: currentScope,
    transactions: Object.freeze(transactions),
    nextCursor: page.nextCursor,
    seenIds: Object.freeze([...seenIds]),
    usedCursors: Object.freeze([...usedCursors]),
  })
}

export const cardTransactionCollectionScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  cardId: string,
  query: AdminCardTransactionQuery,
): string => JSON.stringify([
  actorId,
  sessionExpiresAt,
  tenantId,
  environment,
  cardId,
  'transactions',
  query.status,
  query.type ?? '',
  query.currency ?? '',
  query.from ?? '',
  query.to ?? '',
  String(query.limit),
])

export const cardTransactionRequestScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  cardId: string,
  query: AdminCardTransactionQuery,
  cursor: string | null,
): string => JSON.stringify([
  cardTransactionCollectionScope(actorId, sessionExpiresAt, tenantId, environment, cardId, query),
  cursor,
])

export const cardTransactionDetailScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  cardId: string,
  query: AdminCardTransactionQuery,
  transactionId: string,
): string => JSON.stringify([
  cardTransactionCollectionScope(actorId, sessionExpiresAt, tenantId, environment, cardId, query),
  'detail',
  transactionId,
])

export function adminCardTransactionContractEvidence(sourceCommit: string) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_SHA must be a lowercase 40-character commit SHA')
  return Object.freeze({
    format: 'fastlink-admin-card-transaction-contract-v1',
    sourceCommit,
    environment: 'NON_PRODUCTION',
    runtimeEnvironments: Object.freeze(['SANDBOX', 'TEST']),
    productionEnabled: false,
    readOnlyMethods: Object.freeze(['GET']),
    statusFilters: Object.freeze([...ADMIN_CARD_TRANSACTION_STATUS_FILTERS]),
    allStatusEncoding: 'OMITTED',
    cursor: Object.freeze({ format: 'SIGNED_V1_SCOPE_ID_MAC_BASE64URL', maximumLength: MAX_ADMIN_CARD_TRANSACTION_CURSOR_LENGTH }),
    pageFields: Object.freeze([...ADMIN_CARD_TRANSACTION_PAGE_FIELDS]),
    transactionFields: Object.freeze([...ADMIN_CARD_TRANSACTION_PUBLIC_FIELDS]),
    exactFieldsRequired: true,
    detailBoundToRequestedId: true,
    collectionScopeBindings: Object.freeze(['actorId', 'sessionExpiresAt', 'tenantId', 'environment', 'cardId', 'status', 'type', 'currency', 'from', 'to', 'limit']),
    requestGenerationBound: true,
    activeCancellationRequired: true,
    selectionClearedOnFilterChange: true,
  })
}
