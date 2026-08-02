import type { DataSource } from './adminRoutes.ts'
import type { AdminSession } from './productionApi.ts'

export const ADMIN_WALLET_TRANSACTION_TYPES = Object.freeze([
  'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'MERCHANT_PAYMENT', 'REFUND', 'FX',
] as const)
export const ADMIN_WALLET_TRANSACTION_STATUSES = Object.freeze([
  'PENDING', 'COMPLETED', 'FAILED', 'REVERSED',
] as const)
export const ADMIN_WALLET_TRANSACTION_PAGE_SIZE = 25
export const MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES = 262_144
export const MAX_ADMIN_WALLET_TRANSACTION_JSON_DEPTH = 16

export type AdminWalletTransactionType = (typeof ADMIN_WALLET_TRANSACTION_TYPES)[number]
export type AdminWalletTransactionStatus = (typeof ADMIN_WALLET_TRANSACTION_STATUSES)[number]
export type AdminWalletTransactionQuery = Readonly<{
  type?: AdminWalletTransactionType
  status?: AdminWalletTransactionStatus
  assetCode?: string
  limit: number
  offset: number
}>
export type AdminWalletTransaction = Readonly<{
  id: string
  tenantId: string
  environment: Extract<DataSource, 'SANDBOX' | 'TEST'>
  walletAccountId: string
  type: AdminWalletTransactionType
  status: AdminWalletTransactionStatus
  assetCode: string
  amount: string
  referenceType: string
  referenceId: string
  idempotencyKey: string
  journalIds: readonly string[]
  createdAt: string
  updatedAt: string
}>
export type AdminWalletTransactionPage = Readonly<{
  items: readonly AdminWalletTransaction[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}>
export type AdminWalletTransactionSnapshot = Readonly<{
  scope: string
  page: AdminWalletTransactionPage
}>
export type AdminWalletTransactionLoadResult = Readonly<{
  scope: string
  snapshot: AdminWalletTransactionSnapshot | null
  error: string
  exitSession: boolean
}>
export type AdminWalletTransactionTransportRequest = Readonly<{
  path: string
  method: 'GET'
  token: string
  signal?: AbortSignal
}>
export type AdminWalletTransactionTransport = (
  request: AdminWalletTransactionTransportRequest,
) => Promise<string>

const ITEM_FIELDS = Object.freeze([
  'id', 'tenantId', 'environment', 'walletAccountId', 'type', 'status', 'assetCode',
  'amount', 'referenceType', 'referenceId', 'idempotencyKey', 'journalIds',
  'createdAt', 'updatedAt',
] as const)
const PAGE_FIELDS = Object.freeze(['items', 'pagination'] as const)
const PAGINATION_FIELDS = Object.freeze(['total', 'limit', 'offset', 'hasMore'] as const)
type OwnData = Readonly<Record<string, PropertyDescriptor>>

const invalid = (message: string): never => { throw new Error(message) }
const ownData = (value: unknown, message: string): OwnData => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid(message)
  return Object.getOwnPropertyDescriptors(value)
}
const ownValue = (source: OwnData, key: string): unknown => source[key]?.value
const exactFields = (source: OwnData, fields: readonly string[], message: string): void => {
  const keys = Object.keys(source).sort()
  const expected = [...fields].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid(message)
  if (keys.some((key) => !('value' in source[key]) || !source[key].enumerable)) invalid(message)
}

const text = (source: OwnData, key: string, maximumBytes: number, message: string): string => {
  const value = ownValue(source, key)
  if (
    typeof value !== 'string' || value.length === 0 || value.length > maximumBytes
    || new TextEncoder().encode(value).byteLength > maximumBytes
    || /[\u0000-\u001f\u007f]/.test(value)
  ) invalid(message)
  return value
}
const identifier = (source: OwnData, key: string, message: string): string => {
  const value = text(source, key, 128, message)
  return /^[A-Za-z0-9._:-]{2,128}$/.test(value) ? value : invalid(message)
}
const integer = (source: OwnData, key: string): number => {
  const value = ownValue(source, key)
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : invalid('Invalid Admin Wallet transaction pagination')
}
const timestamp = (source: OwnData, key: string): string => {
  const value = text(source, key, 32, 'Invalid Admin Wallet transaction timestamp')
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : invalid('Invalid Admin Wallet transaction timestamp')
}
const amount = (source: OwnData): string => {
  const value = text(source, 'amount', 37, 'Invalid Admin Wallet transaction amount')
  return /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value) && !(value.includes('.') && value.endsWith('0'))
    ? value
    : value === '0' ? value : invalid('Invalid Admin Wallet transaction amount')
}

const rejectDuplicateJsonKeys = (raw: string): void => {
  let index = 0
  const malformed = () => new Error('Invalid Admin Wallet transaction JSON')
  const whitespace = () => { while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1 }
  const readString = (): string => {
    const start = index
    if (raw[index] !== '"') throw malformed()
    index += 1
    while (index < raw.length) {
      const code = raw.charCodeAt(index)
      if (code === 0x22) {
        index += 1
        try {
          const decoded = JSON.parse(raw.slice(start, index)) as unknown
          if (typeof decoded !== 'string') throw malformed()
          return decoded
        } catch { throw malformed() }
      }
      if (code <= 0x1f) throw malformed()
      if (code === 0x5c) {
        index += 1
        if (index >= raw.length) throw malformed()
        if (raw[index] === 'u') {
          if (!/^[0-9A-Fa-f]{4}$/.test(raw.slice(index + 1, index + 5))) throw malformed()
          index += 5
        } else index += 1
      } else index += 1
    }
    throw malformed()
  }
  const value = (depth: number): void => {
    if (depth > MAX_ADMIN_WALLET_TRANSACTION_JSON_DEPTH) throw malformed()
    whitespace()
    if (raw[index] === '{') {
      index += 1; whitespace(); const keys = new Set<string>()
      if (raw[index] === '}') { index += 1; return }
      while (index < raw.length) {
        const key = readString()
        if (keys.has(key)) throw new Error('Duplicate Admin Wallet transaction JSON key')
        keys.add(key); whitespace()
        if (raw[index] !== ':') throw malformed()
        index += 1; value(depth + 1); whitespace()
        if (raw[index] === '}') { index += 1; return }
        if (raw[index] !== ',') throw malformed()
        index += 1; whitespace()
      }
      throw malformed()
    }
    if (raw[index] === '[') {
      index += 1; whitespace()
      if (raw[index] === ']') { index += 1; return }
      while (index < raw.length) {
        value(depth + 1); whitespace()
        if (raw[index] === ']') { index += 1; return }
        if (raw[index] !== ',') throw malformed()
        index += 1; whitespace()
      }
      throw malformed()
    }
    if (raw[index] === '"') { readString(); return }
    for (const literal of ['true', 'false', 'null']) {
      if (raw.startsWith(literal, index)) { index += literal.length; return }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index))
    if (!number) throw malformed()
    index += number[0].length
  }
  whitespace(); value(0); whitespace()
  if (index !== raw.length) throw malformed()
}

const boundedJson = (raw: unknown): unknown => {
  if (
    typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES
    || new TextEncoder().encode(raw).byteLength > MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES
  ) invalid('Admin Wallet transaction response exceeds the consumer limit')
  rejectDuplicateJsonKeys(raw)
  try { return JSON.parse(raw) as unknown } catch { return invalid('Invalid Admin Wallet transaction JSON') }
}

export function normalizeAdminWalletTransactionQuery(value: unknown): AdminWalletTransactionQuery {
  const source = ownData(value, 'Invalid Admin Wallet transaction query')
  const keys = Object.keys(source).sort()
  const allowed = new Set(['type', 'status', 'assetCode', 'limit', 'offset'])
  if (keys.some((key) => !allowed.has(key)) || keys.some((key) => !('value' in source[key]))) invalid('Invalid Admin Wallet transaction query')
  const type = ownValue(source, 'type')
  const status = ownValue(source, 'status')
  const assetCode = ownValue(source, 'assetCode')
  const limit = ownValue(source, 'limit')
  const offset = ownValue(source, 'offset')
  if (type !== undefined && !(ADMIN_WALLET_TRANSACTION_TYPES as readonly unknown[]).includes(type)) invalid('Invalid Admin Wallet transaction type')
  if (status !== undefined && !(ADMIN_WALLET_TRANSACTION_STATUSES as readonly unknown[]).includes(status)) invalid('Invalid Admin Wallet transaction status')
  if (assetCode !== undefined && (typeof assetCode !== 'string' || !/^[A-Z0-9]{2,12}$/.test(assetCode))) invalid('Invalid Admin Wallet transaction asset')
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100) invalid('Invalid Admin Wallet transaction limit')
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) invalid('Invalid Admin Wallet transaction offset')
  return Object.freeze({
    ...(type === undefined ? {} : { type: type as AdminWalletTransactionType }),
    ...(status === undefined ? {} : { status: status as AdminWalletTransactionStatus }),
    ...(assetCode === undefined ? {} : { assetCode }),
    limit: limit as number,
    offset: offset as number,
  })
}

type SessionFacts = Readonly<{
  token: string
  actorId: string
  homeTenantId: string
  environment: Extract<DataSource, 'SANDBOX' | 'TEST'>
  expiresAt: string
  roles: readonly string[]
  permissions: readonly string[]
}>
const stringList = (value: unknown): readonly string[] => {
  if (
    !Array.isArray(value) || value.length > 100
    || Array.from({ length: value.length }, (_, index) => index).some((index) => !Object.prototype.hasOwnProperty.call(value, index))
    || value.some((entry) => typeof entry !== 'string' || entry.length === 0 || entry.length > 128)
  ) invalid('Invalid Admin session scope')
  return Object.freeze([...value].sort())
}
const sessionFacts = (session: AdminSession, tenantId: string, now: number): SessionFacts => {
  const source = ownData(session, 'Invalid Admin session scope')
  const user = ownData(ownValue(source, 'user'), 'Invalid Admin session scope')
  const token = text(source, 'accessToken', 8192, 'Invalid Admin session scope')
  const expiresAt = text(source, 'expiresAt', 64, 'Invalid Admin session scope')
  const actorId = identifier(user, 'id', 'Invalid Admin session scope')
  const homeTenantId = identifier(user, 'tenantId', 'Invalid Admin session scope')
  const environment = ownValue(user, 'environment')
  if ((environment !== 'SANDBOX' && environment !== 'TEST') || tenantId !== homeTenantId) invalid('Invalid Admin session scope')
  const expiry = Date.parse(expiresAt)
  if (!Number.isFinite(expiry) || expiry <= now) invalid('Invalid Admin session scope')
  const roles = stringList(ownValue(user, 'roles'))
  const permissions = stringList(ownValue(user, 'permissions'))
  if (!permissions.includes('admin:read')) invalid('Invalid Admin session scope')
  return Object.freeze({
    token, actorId, homeTenantId, environment,
    expiresAt,
    roles,
    permissions,
  })
}

export function adminWalletTransactionScope(
  session: AdminSession,
  tenantId: string,
  queryInput: unknown,
  now = Date.now(),
): string {
  const query = normalizeAdminWalletTransactionQuery(queryInput)
  const facts = sessionFacts(session, tenantId, now)
  return JSON.stringify([
    facts.actorId, facts.homeTenantId, tenantId, facts.environment, facts.expiresAt,
    facts.roles, facts.permissions, query.type ?? '', query.status ?? '', query.assetCode ?? '',
    query.limit, query.offset,
  ])
}

export function adminWalletTransactionPath(
  session: AdminSession,
  tenantId: string,
  queryInput: unknown,
  now = Date.now(),
): string {
  const query = normalizeAdminWalletTransactionQuery(queryInput)
  const facts = sessionFacts(session, tenantId, now)
  const params = new URLSearchParams({ environment: facts.environment })
  if (query.type) params.set('type', query.type)
  if (query.status) params.set('status', query.status)
  if (query.assetCode) params.set('assetCode', query.assetCode)
  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))
  return `/admin/tenants/${encodeURIComponent(tenantId)}/wallet/transactions?${params}`
}

const parseTransaction = (
  value: unknown,
  expectedTenantId: string,
  expectedEnvironment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
  query: AdminWalletTransactionQuery,
): AdminWalletTransaction => {
  const source = ownData(value, 'Invalid Admin Wallet transaction record')
  exactFields(source, ITEM_FIELDS, 'Invalid Admin Wallet transaction record')
  const tenantId = identifier(source, 'tenantId', 'Invalid Admin Wallet transaction record')
  const environment = text(source, 'environment', 16, 'Invalid Admin Wallet transaction record')
  if (tenantId !== expectedTenantId || environment !== expectedEnvironment) invalid('Admin Wallet transaction scope mismatch')
  const type = text(source, 'type', 32, 'Invalid Admin Wallet transaction record')
  const status = text(source, 'status', 32, 'Invalid Admin Wallet transaction record')
  const assetCode = text(source, 'assetCode', 12, 'Invalid Admin Wallet transaction record')
  if (!(ADMIN_WALLET_TRANSACTION_TYPES as readonly string[]).includes(type) || (query.type && type !== query.type)) invalid('Admin Wallet transaction filter mismatch')
  if (!(ADMIN_WALLET_TRANSACTION_STATUSES as readonly string[]).includes(status) || (query.status && status !== query.status)) invalid('Admin Wallet transaction filter mismatch')
  if (!/^[A-Z0-9]{2,12}$/.test(assetCode) || (query.assetCode && assetCode !== query.assetCode)) invalid('Admin Wallet transaction filter mismatch')
  const journalValue = ownValue(source, 'journalIds')
  if (
    !Array.isArray(journalValue) || journalValue.length > 100
    || Array.from({ length: journalValue.length }, (_, index) => index).some((index) => !Object.prototype.hasOwnProperty.call(journalValue, index))
  ) invalid('Invalid Admin Wallet transaction journal ids')
  const journalIds = journalValue.map((journalId) => identifier(Object.getOwnPropertyDescriptors({ journalId }), 'journalId', 'Invalid Admin Wallet transaction journal id'))
  if (new Set(journalIds).size !== journalIds.length) invalid('Invalid Admin Wallet transaction journal ids')
  const createdAt = timestamp(source, 'createdAt')
  const updatedAt = timestamp(source, 'updatedAt')
  if (updatedAt < createdAt) invalid('Invalid Admin Wallet transaction timestamp')
  return Object.freeze({
    id: identifier(source, 'id', 'Invalid Admin Wallet transaction record'),
    tenantId,
    environment: environment as Extract<DataSource, 'SANDBOX' | 'TEST'>,
    walletAccountId: identifier(source, 'walletAccountId', 'Invalid Admin Wallet transaction record'),
    type: type as AdminWalletTransactionType,
    status: status as AdminWalletTransactionStatus,
    assetCode,
    amount: amount(source),
    referenceType: text(source, 'referenceType', 128, 'Invalid Admin Wallet transaction record'),
    referenceId: identifier(source, 'referenceId', 'Invalid Admin Wallet transaction record'),
    idempotencyKey: identifier(source, 'idempotencyKey', 'Invalid Admin Wallet transaction record'),
    journalIds: Object.freeze(journalIds),
    createdAt,
    updatedAt,
  })
}

export function parseAdminWalletTransactionPage(
  wireValue: unknown,
  expected: Readonly<{
    tenantId: string
    environment: Extract<DataSource, 'SANDBOX' | 'TEST'>
    query: AdminWalletTransactionQuery
  }>,
): AdminWalletTransactionPage {
  const query = normalizeAdminWalletTransactionQuery(expected.query)
  if (!/^[A-Za-z0-9._:-]{2,128}$/.test(expected.tenantId) || (expected.environment !== 'SANDBOX' && expected.environment !== 'TEST')) {
    invalid('Admin Wallet transaction scope mismatch')
  }
  const page = ownData(boundedJson(wireValue), 'Invalid Admin Wallet transaction page')
  exactFields(page, PAGE_FIELDS, 'Invalid Admin Wallet transaction page')
  const rawItems = ownValue(page, 'items')
  if (
    !Array.isArray(rawItems) || rawItems.length > query.limit
    || Array.from({ length: rawItems.length }, (_, index) => index).some((index) => !Object.prototype.hasOwnProperty.call(rawItems, index))
  ) invalid('Invalid Admin Wallet transaction page')
  const items = rawItems.map((item) => parseTransaction(item, expected.tenantId, expected.environment, query))
  const ids = new Set<string>()
  items.forEach((item, index) => {
    if (ids.has(item.id)) invalid('Duplicate Admin Wallet transaction id')
    ids.add(item.id)
    const previous = items[index - 1]
    if (previous && (previous.createdAt < item.createdAt || (previous.createdAt === item.createdAt && previous.id <= item.id))) invalid('Invalid Admin Wallet transaction order')
  })
  const pagination = ownData(ownValue(page, 'pagination'), 'Invalid Admin Wallet transaction pagination')
  exactFields(pagination, PAGINATION_FIELDS, 'Invalid Admin Wallet transaction pagination')
  const total = integer(pagination, 'total')
  const limit = integer(pagination, 'limit')
  const offset = integer(pagination, 'offset')
  const hasMore = ownValue(pagination, 'hasMore')
  if (limit !== query.limit || offset !== query.offset || typeof hasMore !== 'boolean') invalid('Admin Wallet transaction pagination mismatch')
  if (total < offset + items.length || (items.length === 0 && offset < total)) invalid('Invalid Admin Wallet transaction pagination')
  if (hasMore !== (offset + items.length < total)) invalid('Invalid Admin Wallet transaction pagination')
  return Object.freeze({ items: Object.freeze(items), total, limit, offset, hasMore })
}

const aborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Admin Wallet transaction request cancelled', 'AbortError')
}
export async function readAdminWalletTransactions(
  transport: AdminWalletTransactionTransport,
  session: AdminSession,
  tenantId: string,
  queryInput: unknown,
  expectedScope: string,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<AdminWalletTransactionSnapshot> {
  const query = normalizeAdminWalletTransactionQuery(queryInput)
  const scope = adminWalletTransactionScope(session, tenantId, query, now())
  if (scope !== expectedScope) invalid('Admin Wallet transaction request scope mismatch')
  const facts = sessionFacts(session, tenantId, now())
  const path = adminWalletTransactionPath(session, tenantId, query, now())
  aborted(signal)
  const wire = await transport({ path, method: 'GET', token: facts.token, signal })
  aborted(signal)
  if (adminWalletTransactionScope(session, tenantId, query, now()) !== scope) invalid('Admin Wallet transaction session expired during the request')
  const page = parseAdminWalletTransactionPage(wire, { tenantId, environment: facts.environment, query })
  return Object.freeze({ scope, page })
}

const errorStatus = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null
  const descriptor = Object.getOwnPropertyDescriptor(value, 'status')
  return descriptor && 'value' in descriptor && Number.isInteger(descriptor.value) ? descriptor.value as number : null
}
export function adminWalletTransactionFailureDecision(value: unknown): 'EXIT_SESSION' | 'RETAIN_VERIFIED' | 'DROP' | 'ABORT' {
  if (value instanceof DOMException && value.name === 'AbortError') return 'ABORT'
  const status = errorStatus(value)
  if (status === 499) return 'ABORT'
  if (status === 401) return 'EXIT_SESSION'
  if (status === 408 || (status !== null && status >= 500 && status <= 599)) return 'RETAIN_VERIFIED'
  return 'DROP'
}

export async function loadAdminWalletTransactions(
  transport: AdminWalletTransactionTransport,
  session: AdminSession,
  tenantId: string,
  queryInput: unknown,
  previous: AdminWalletTransactionSnapshot | null,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<AdminWalletTransactionLoadResult> {
  const scope = adminWalletTransactionScope(session, tenantId, queryInput, now())
  try {
    const snapshot = await readAdminWalletTransactions(transport, session, tenantId, queryInput, scope, signal, now)
    return Object.freeze({ scope, snapshot, error: '', exitSession: false })
  } catch (error) {
    const decision = adminWalletTransactionFailureDecision(error)
    if (decision === 'ABORT') throw error
    if (decision === 'EXIT_SESSION') return Object.freeze({ scope, snapshot: null, error: '', exitSession: true })
    const retained = decision === 'RETAIN_VERIFIED' && previous?.scope === scope ? previous : null
    return Object.freeze({ scope, snapshot: retained, error: 'Admin Wallet transaction read is temporarily unavailable', exitSession: false })
  }
}
