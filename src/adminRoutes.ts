export type DataSource = 'SANDBOX' | 'TEST' | 'UAT' | 'PRODUCTION'
export const ADMIN_WALLET_OPERATION_TYPES = [
  'DEPOSIT',
  'INTERNAL_TRANSFER',
  'WITHDRAWAL',
  'TREASURY_RESERVE',
  'FX_CONVERSION',
] as const
export const ADMIN_WALLET_OPERATION_STATUSES = [
  'PROCESSING',
  'PENDING_SETTLEMENT',
  'COMPLETED',
  'FAILED',
] as const

export type AdminWalletOperationType = (typeof ADMIN_WALLET_OPERATION_TYPES)[number]
export type AdminWalletOperationStatus = (typeof ADMIN_WALLET_OPERATION_STATUSES)[number]
export type AdminWalletOperationQuery = Readonly<{
  status?: AdminWalletOperationStatus
  type?: AdminWalletOperationType
  assetCode?: string
  limit: number
  offset: number
}>
export const ADMIN_CARD_TRANSACTION_STATUSES = [
  'AUTHORIZED',
  'CLEARED',
  'SETTLED',
  'DECLINED',
  'REVERSED',
  'REFUNDED',
] as const
export const ADMIN_CARD_TRANSACTION_STATUS_FILTERS = [
  'ALL',
  ...ADMIN_CARD_TRANSACTION_STATUSES,
] as const
export const ADMIN_CARD_TRANSACTION_TYPES = [
  'AUTHORIZATION',
  'CLEARING',
  'SETTLEMENT',
  'DECLINE',
  'REVERSAL',
  'REFUND',
] as const
export const MAX_ADMIN_CARD_TRANSACTION_CURSOR_LENGTH = 512
export const MAX_ADMIN_CARD_TIMELINE_CURSOR_LENGTH = 2_048

export type AdminCardTransactionStatus = (typeof ADMIN_CARD_TRANSACTION_STATUSES)[number]
export type AdminCardTransactionStatusFilter = (typeof ADMIN_CARD_TRANSACTION_STATUS_FILTERS)[number]
export type AdminCardTransactionType = (typeof ADMIN_CARD_TRANSACTION_TYPES)[number]

export const ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE: Readonly<Record<AdminCardTransactionType, AdminCardTransactionStatus>> = Object.freeze({
  AUTHORIZATION: 'AUTHORIZED',
  CLEARING: 'CLEARED',
  SETTLEMENT: 'SETTLED',
  DECLINE: 'DECLINED',
  REVERSAL: 'REVERSED',
  REFUND: 'REFUNDED',
})

export type AdminCardTransactionQuery = Readonly<{
  status: AdminCardTransactionStatusFilter
  type?: AdminCardTransactionType
  currency?: string
  from?: string
  to?: string
  limit: number
}>

const segment = (value: string) => encodeURIComponent(value)
const environmentQuery = (environment: DataSource) =>
  `environment=${encodeURIComponent(environment)}`

const walletOperationQuery = (
  environment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
  query: AdminWalletOperationQuery,
): string => {
  if (!(environment === 'SANDBOX' || environment === 'TEST')) throw new Error('Wallet operation environment is invalid')
  if (query.status && !(ADMIN_WALLET_OPERATION_STATUSES as readonly string[]).includes(query.status)) {
    throw new Error('Wallet operation status is invalid')
  }
  if (query.type && !(ADMIN_WALLET_OPERATION_TYPES as readonly string[]).includes(query.type)) {
    throw new Error('Wallet operation type is invalid')
  }
  if (query.assetCode && !/^[A-Z0-9]{2,12}$/.test(query.assetCode)) {
    throw new Error('Wallet operation asset code is invalid')
  }
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    throw new Error('Wallet operation limit must be between 1 and 100')
  }
  if (!Number.isInteger(query.offset) || query.offset < 0) {
    throw new Error('Wallet operation offset is invalid')
  }
  const params = new URLSearchParams()
  params.set('environment', environment)
  if (query.status) params.set('status', query.status)
  if (query.type) params.set('type', query.type)
  if (query.assetCode) params.set('assetCode', query.assetCode)
  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))
  return params.toString()
}

export const isCanonicalSignedAdminCardTransactionCursor = (cursor: unknown): cursor is string => {
  if (
    typeof cursor !== 'string'
    || cursor.length === 0
    || cursor.length > MAX_ADMIN_CARD_TRANSACTION_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) return false
  try {
    const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const canonical = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    if (canonical !== cursor) return false
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return false
    const keys = Object.keys(payload).sort()
    if (keys.join(',') !== 'i,m,s,v') return false
    const record = payload as Record<string, unknown>
    return record.v === 1
      && typeof record.s === 'string' && /^[a-f0-9]{64}$/.test(record.s)
      && typeof record.i === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(record.i)
      && typeof record.m === 'string' && /^[A-Za-z0-9_-]{43}$/.test(record.m)
  } catch {
    return false
  }
}

const canonicalBase64Url = (value: string): Uint8Array | null => {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const canonical = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    return canonical === value ? bytes : null
  } catch {
    return null
  }
}

export const isCanonicalSignedAdminCardTimelineCursor = (cursor: unknown): cursor is string => {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_ADMIN_CARD_TIMELINE_CURSOR_LENGTH) return false
  const parts = cursor.split('.')
  if (parts.length !== 2) return false
  const payloadBytes = canonicalBase64Url(parts[0])
  const macBytes = canonicalBase64Url(parts[1])
  if (!payloadBytes || !macBytes || macBytes.byteLength !== 32) return false
  try {
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes)) as unknown
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return false
    const descriptors = Object.getOwnPropertyDescriptors(payload)
    if (Object.keys(descriptors).sort().join(',') !== 'i,k,t,v' || Object.keys(descriptors).some((key) => !('value' in descriptors[key]))) return false
    const record = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])) as Record<string, unknown>
    const parsed = typeof record.t === 'string' ? new Date(record.t) : null
    return record.v === 1
      && typeof record.i === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(record.i)
      && (record.k === 'LIFECYCLE' || record.k === 'EVENT')
      && Boolean(parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === record.t)
  } catch {
    return false
  }
}

const cardTransactionQuery = (query: AdminCardTransactionQuery, cursor?: string): string => {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 25) throw new Error('Card transaction limit must be between 1 and 25')
  if (!(ADMIN_CARD_TRANSACTION_STATUS_FILTERS as readonly string[]).includes(query.status)) {
    throw new Error('Card transaction status is invalid')
  }
  if (query.type && !(ADMIN_CARD_TRANSACTION_TYPES as readonly string[]).includes(query.type)) {
    throw new Error('Card transaction type is invalid')
  }
  if (query.status !== 'ALL' && query.type && ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE[query.type] !== query.status) {
    throw new Error('Card transaction status and type do not match')
  }
  if (query.currency && !/^[A-Z]{3}$/.test(query.currency)) throw new Error('Card transaction currency is invalid')
  for (const value of [query.from, query.to]) {
    if (!value) continue
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error('Card transaction date is invalid')
    }
  }
  if (query.from && query.to && query.from > query.to) throw new Error('Card transaction date range is invalid')
  if (cursor && !isCanonicalSignedAdminCardTransactionCursor(cursor)) {
    throw new Error('Card transaction cursor is invalid')
  }
  const params = new URLSearchParams()
  if (query.status !== 'ALL') params.set('status', query.status)
  if (query.type) params.set('type', query.type)
  if (query.currency) params.set('currency', query.currency)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  params.set('limit', String(query.limit))
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

const cardTimelineQuery = (cursor?: string): string => {
  if (cursor !== undefined && !isCanonicalSignedAdminCardTimelineCursor(cursor)) {
    throw new Error('Card timeline cursor is invalid')
  }
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

export const adminRoutes = {
  tenant: (tenantId: string) =>
    `/admin/tenants/${segment(tenantId)}`,
  readiness: (tenantId: string) =>
    `${adminRoutes.tenant(tenantId)}/integrations/readiness`,
  treasuryLiquidity: (tenantId: string, environment: Extract<DataSource, 'SANDBOX' | 'TEST'>) =>
    `${adminRoutes.tenant(tenantId)}/settlement/liquidity?${environmentQuery(environment)}`,
  treasuryReconciliation: (tenantId: string, environment: Extract<DataSource, 'SANDBOX' | 'TEST'>) =>
    `${adminRoutes.tenant(tenantId)}/settlement/reconciliation?${environmentQuery(environment)}`,
  treasuryTrialBalance: (tenantId: string, environment: Extract<DataSource, 'SANDBOX' | 'TEST'>) =>
    `${adminRoutes.tenant(tenantId)}/settlement/trial-balance?${environmentQuery(environment)}`,
  treasuryDailyClosing: (tenantId: string, environment: Extract<DataSource, 'SANDBOX' | 'TEST'>) =>
    `${adminRoutes.tenant(tenantId)}/settlement/daily-closing?${environmentQuery(environment)}`,
  walletOperations: (
    tenantId: string,
    environment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
    query: AdminWalletOperationQuery,
  ) => `${adminRoutes.tenant(tenantId)}/wallet/operations?${walletOperationQuery(environment, query)}`,
  walletTransactions: (tenantId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/transactions?${environmentQuery(environment)}&limit=100`,
  walletOperation: (tenantId: string, operationId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/operations/${segment(operationId)}?${environmentQuery(environment)}`,
  card: (tenantId: string, cardId: string) =>
    `${adminRoutes.tenant(tenantId)}/cards/${segment(cardId)}`,
  cardBalance: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/balance`,
  cardTimeline: (tenantId: string, cardId: string, cursor?: string) =>
    `${adminRoutes.card(tenantId, cardId)}/timeline?${cardTimelineQuery(cursor)}`,
  cardTransactions: (tenantId: string, cardId: string, query: AdminCardTransactionQuery, cursor?: string) =>
    `${adminRoutes.card(tenantId, cardId)}/transactions?${cardTransactionQuery(query, cursor)}`,
  cardTransaction: (tenantId: string, cardId: string, transactionId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/transactions/${segment(transactionId)}`,
  freezeCard: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/freeze`,
  unfreezeCard: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/unfreeze`,
}
