import {
  ADMIN_WALLET_OPERATION_STATUSES,
  ADMIN_WALLET_OPERATION_TYPES,
  type AdminWalletOperationQuery,
  type AdminWalletOperationStatus,
  type AdminWalletOperationType,
  type DataSource,
} from './adminRoutes.ts'
import type { AdminSession } from './productionApi.ts'

export const MAX_WALLET_OPERATION_LIST_JSON_BYTES = 262_144
export const MAX_WALLET_OPERATION_LIST_JSON_DEPTH = 16
export const WALLET_OPERATION_PAGE_SIZE = 25

const OPERATION_FIELDS = Object.freeze([
  'id',
  'tenantId',
  'environment',
  'type',
  'status',
  'idempotencyKey',
  'assetCode',
  'amount',
  'sourceAccountId',
  'destinationAccountId',
  'externalReference',
  'journalIds',
  'failureReason',
  'createdAt',
  'completedAt',
  'updatedAt',
] as const)
const PAGE_FIELDS = Object.freeze(['items', 'pagination'] as const)
const PAGINATION_FIELDS = Object.freeze(['total', 'limit', 'offset', 'hasMore'] as const)

export type AdminWalletOperation = Readonly<{
  id: string
  type: AdminWalletOperationType
  status: AdminWalletOperationStatus
  assetCode: string
  amount: string
  sourceAccountId: string | null
  destinationAccountId: string | null
  createdAt: string
  completedAt: string | null
  updatedAt: string
}>

export type AdminWalletOperationPage = Readonly<{
  operations: readonly AdminWalletOperation[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}>

type ContractCode =
  | 'INVALID_PAGE'
  | 'INVALID_OPERATION'
  | 'PAGE_SIZE_EXCEEDED'
  | 'DUPLICATE_OPERATION_ID'
  | 'NON_MONOTONIC_ORDER'
  | 'SCOPE_MISMATCH'

export class WalletOperationListContractError extends Error {
  readonly code: ContractCode

  constructor(code: ContractCode) {
    super({
      INVALID_PAGE: 'Wallet operation response could not be verified',
      INVALID_OPERATION: 'Wallet operation record could not be verified',
      PAGE_SIZE_EXCEEDED: 'Wallet operation page exceeds the requested size',
      DUPLICATE_OPERATION_ID: 'Wallet operation page contains a duplicate record',
      NON_MONOTONIC_ORDER: 'Wallet operations are not in the expected order',
      SCOPE_MISMATCH: 'Wallet operation response does not match the current Admin scope',
    }[code])
    this.code = code
    this.name = 'WalletOperationListContractError'
  }
}

type OwnData = Readonly<Record<string, PropertyDescriptor>>
const invalid = (code: ContractCode): never => { throw new WalletOperationListContractError(code) }

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
      if (depth > MAX_WALLET_OPERATION_LIST_JSON_DEPTH) return false
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return !inString && !escaped && depth === 0
}

const boundedJson = (wireValue: unknown, code: ContractCode): unknown => {
  if (typeof wireValue !== 'string' || wireValue.length === 0) invalid(code)
  if (wireValue.length > MAX_WALLET_OPERATION_LIST_JSON_BYTES) invalid(code)
  if (new TextEncoder().encode(wireValue).byteLength > MAX_WALLET_OPERATION_LIST_JSON_BYTES) invalid(code)
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
  return /^[A-Za-z0-9._:-]{2,128}$/.test(value) ? value : invalid(code)
}
const nullableIdentifier = (source: OwnData, key: string): string | null => {
  if (ownValue(source, key) === null) return null
  return identifier(source, key, 'INVALID_OPERATION')
}
const nullableText = (source: OwnData, key: string, maxBytes: number): string | null => {
  if (ownValue(source, key) === null) return null
  return text(source, key, maxBytes, 'INVALID_OPERATION')
}
const timestamp = (source: OwnData, key: string): string => {
  const value = text(source, key, 32, 'INVALID_OPERATION')
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : invalid('INVALID_OPERATION')
}
const nullableTimestamp = (source: OwnData, key: string): string | null => {
  if (ownValue(source, key) === null) return null
  return timestamp(source, key)
}
const integer = (source: OwnData, key: string): number => {
  const value = ownValue(source, key)
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid('INVALID_PAGE')
}

const parseOperation = (
  value: unknown,
  expectedTenantId: string,
  expectedEnvironment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
  query: AdminWalletOperationQuery,
): AdminWalletOperation => {
  const source = ownData(value, 'INVALID_OPERATION')
  exactFields(source, OPERATION_FIELDS, 'INVALID_OPERATION')
  if (identifier(source, 'tenantId', 'INVALID_OPERATION') !== expectedTenantId) invalid('SCOPE_MISMATCH')
  if (text(source, 'environment', 16, 'INVALID_OPERATION') !== expectedEnvironment) invalid('SCOPE_MISMATCH')

  const type = text(source, 'type', 32, 'INVALID_OPERATION')
  if (!(ADMIN_WALLET_OPERATION_TYPES as readonly string[]).includes(type)) invalid('INVALID_OPERATION')
  if (query.type && query.type !== type) invalid('SCOPE_MISMATCH')
  const status = text(source, 'status', 32, 'INVALID_OPERATION')
  if (!(ADMIN_WALLET_OPERATION_STATUSES as readonly string[]).includes(status)) invalid('INVALID_OPERATION')
  if (query.status && query.status !== status) invalid('SCOPE_MISMATCH')
  const assetCode = text(source, 'assetCode', 12, 'INVALID_OPERATION')
  if (!/^[A-Z0-9]{2,12}$/.test(assetCode)) invalid('INVALID_OPERATION')
  if (query.assetCode && query.assetCode !== assetCode) invalid('SCOPE_MISMATCH')
  const amount = text(source, 'amount', 64, 'INVALID_OPERATION')
  if (!/^(0|[1-9][0-9]{0,17})(?:\.[0-9]{1,18})?$/.test(amount)) invalid('INVALID_OPERATION')

  identifier(source, 'idempotencyKey', 'INVALID_OPERATION')
  nullableText(source, 'externalReference', 256)
  nullableText(source, 'failureReason', 512)
  const journals = ownValue(source, 'journalIds')
  if (!Array.isArray(journals) || journals.length > 100) invalid('INVALID_OPERATION')
  const journalIds = journals.map((journalId) => {
    const wrapper = Object.getOwnPropertyDescriptors({ journalId })
    return identifier(wrapper, 'journalId', 'INVALID_OPERATION')
  })
  if (new Set(journalIds).size !== journalIds.length) invalid('INVALID_OPERATION')

  const operation = Object.freeze({
    id: identifier(source, 'id', 'INVALID_OPERATION'),
    type: type as AdminWalletOperationType,
    status: status as AdminWalletOperationStatus,
    assetCode,
    amount,
    sourceAccountId: nullableIdentifier(source, 'sourceAccountId'),
    destinationAccountId: nullableIdentifier(source, 'destinationAccountId'),
    createdAt: timestamp(source, 'createdAt'),
    completedAt: nullableTimestamp(source, 'completedAt'),
    updatedAt: timestamp(source, 'updatedAt'),
  })
  if (operation.createdAt > operation.updatedAt) invalid('INVALID_OPERATION')
  if (operation.completedAt && (operation.completedAt < operation.createdAt || operation.completedAt > operation.updatedAt)) {
    invalid('INVALID_OPERATION')
  }
  return operation
}

const compareOrder = (left: AdminWalletOperation, right: AdminWalletOperation): number => {
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1
  if (left.id === right.id) return 0
  return left.id > right.id ? -1 : 1
}

export function parseAdminWalletOperationPage(
  wireValue: unknown,
  expected: Readonly<{
    tenantId: string
    environment: Extract<DataSource, 'SANDBOX' | 'TEST'>
    query: AdminWalletOperationQuery
  }>,
): AdminWalletOperationPage {
  if (!/^[A-Za-z0-9._:-]{2,128}$/.test(expected.tenantId)) invalid('SCOPE_MISMATCH')
  const { query } = expected
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) invalid('PAGE_SIZE_EXCEEDED')
  if (!Number.isInteger(query.offset) || query.offset < 0) invalid('INVALID_PAGE')
  const source = ownData(boundedJson(wireValue, 'INVALID_PAGE'), 'INVALID_PAGE')
  exactFields(source, PAGE_FIELDS, 'INVALID_PAGE')
  const rawItems = ownValue(source, 'items')
  if (!Array.isArray(rawItems)) invalid('INVALID_PAGE')
  if (rawItems.length > query.limit) invalid('PAGE_SIZE_EXCEEDED')
  const operations = rawItems.map((item) => parseOperation(item, expected.tenantId, expected.environment, query))
  const seen = new Set<string>()
  operations.forEach((operation, index) => {
    if (seen.has(operation.id)) invalid('DUPLICATE_OPERATION_ID')
    seen.add(operation.id)
    if (index > 0 && compareOrder(operations[index - 1], operation) >= 0) invalid('NON_MONOTONIC_ORDER')
  })

  const pagination = ownData(ownValue(source, 'pagination'), 'INVALID_PAGE')
  exactFields(pagination, PAGINATION_FIELDS, 'INVALID_PAGE')
  const total = integer(pagination, 'total')
  const limit = integer(pagination, 'limit')
  const offset = integer(pagination, 'offset')
  const hasMore = ownValue(pagination, 'hasMore')
  if (limit !== query.limit || offset !== query.offset || typeof hasMore !== 'boolean') invalid('SCOPE_MISMATCH')
  if (operations.length > 0 && total < offset + operations.length) invalid('INVALID_PAGE')
  if (hasMore !== (offset + operations.length < total)) invalid('INVALID_PAGE')
  if ((operations.length === 0 && offset < total) || (hasMore && operations.length === 0)) invalid('INVALID_PAGE')
  return Object.freeze({ operations: Object.freeze(operations), total, limit, offset, hasMore })
}

export const walletOperationListScope = (
  actorId: string,
  sessionExpiresAt: string,
  tenantId: string,
  environment: DataSource,
  query: AdminWalletOperationQuery,
  homeTenantId = '',
  roles: readonly string[] = [],
  permissions: readonly string[] = [],
): string => JSON.stringify([
  actorId,
  sessionExpiresAt,
  homeTenantId,
  tenantId,
  environment,
  [...roles].sort(),
  [...permissions].sort(),
  query.status ?? '',
  query.type ?? '',
  query.assetCode ?? '',
  String(query.limit),
  String(query.offset),
])

export const walletOperationSessionReadAllowed = (
  session: AdminSession,
  tenantId: string,
  environment: DataSource,
  now: number,
): boolean => (environment === 'SANDBOX' || environment === 'TEST')
  && session.user.environment === environment
  && tenantId.length > 0
  && session.user.tenantId.length > 0
  && /^[A-Za-z0-9._:-]{2,128}$/.test(session.user.id)
  && Array.isArray(session.user.roles)
  && Array.isArray(session.user.permissions)
  && session.accessToken.length > 0
  && Number.isFinite(Date.parse(session.expiresAt))
  && Date.parse(session.expiresAt) > now

export function adminWalletOperationContractEvidence(sourceCommit: string) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_SHA must be a lowercase 40-character commit SHA')
  return Object.freeze({
    format: 'fastlink-admin-wallet-operation-list-contract-v1',
    sourceCommit,
    runtimeEnvironments: Object.freeze(['SANDBOX', 'TEST']),
    productionEnabled: false,
    readOnlyMethods: Object.freeze(['GET']),
    filters: Object.freeze(['status', 'type', 'assetCode']),
    pagination: Object.freeze({ kind: 'offset', maximumPageSize: 100, uiPageSize: WALLET_OPERATION_PAGE_SIZE }),
    exactWireFieldsRequired: true,
    renderedFields: Object.freeze(['id', 'type', 'status', 'assetCode', 'amount', 'sourceAccountId', 'destinationAccountId', 'createdAt', 'completedAt', 'updatedAt']),
    scopeBindings: Object.freeze(['actorId', 'sessionExpiresAt', 'homeTenantId', 'tenantId', 'environment', 'roles', 'permissions', 'status', 'type', 'assetCode', 'limit', 'offset']),
    activeCancellationRequired: true,
    staleAndUnmountedWrites: 0,
  })
}
