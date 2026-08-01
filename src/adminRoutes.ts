export type DataSource = 'SANDBOX' | 'TEST' | 'UAT' | 'PRODUCTION'
export const ADMIN_CARD_TRANSACTION_STATUSES = [
  'AUTHORIZED',
  'CLEARED',
  'SETTLED',
  'DECLINED',
  'REVERSED',
  'REFUNDED',
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

export type AdminCardTransactionStatus = (typeof ADMIN_CARD_TRANSACTION_STATUSES)[number]
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
  status?: AdminCardTransactionStatus
  type?: AdminCardTransactionType
  currency?: string
  from?: string
  to?: string
  limit: number
}>

const segment = (value: string) => encodeURIComponent(value)
const environmentQuery = (environment: DataSource) =>
  `environment=${encodeURIComponent(environment)}`

const cardTransactionQuery = (query: AdminCardTransactionQuery, cursor?: string): string => {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 25) throw new Error('Card transaction limit must be between 1 and 25')
  if (query.status && !(ADMIN_CARD_TRANSACTION_STATUSES as readonly string[]).includes(query.status)) {
    throw new Error('Card transaction status is invalid')
  }
  if (query.type && !(ADMIN_CARD_TRANSACTION_TYPES as readonly string[]).includes(query.type)) {
    throw new Error('Card transaction type is invalid')
  }
  if (query.status && query.type && ADMIN_CARD_TRANSACTION_STATUS_BY_TYPE[query.type] !== query.status) {
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
  if (cursor && (cursor.length > MAX_ADMIN_CARD_TRANSACTION_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new Error('Card transaction cursor is invalid')
  }
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.type) params.set('type', query.type)
  if (query.currency) params.set('currency', query.currency)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  params.set('limit', String(query.limit))
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

export const adminRoutes = {
  tenant: (tenantId: string) =>
    `/admin/tenants/${segment(tenantId)}`,
  readiness: (tenantId: string) =>
    `${adminRoutes.tenant(tenantId)}/integrations/readiness`,
  walletOperations: (tenantId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/operations?${environmentQuery(environment)}&limit=100`,
  walletTransactions: (tenantId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/transactions?${environmentQuery(environment)}&limit=100`,
  walletOperation: (tenantId: string, operationId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/operations/${segment(operationId)}?${environmentQuery(environment)}`,
  card: (tenantId: string, cardId: string) =>
    `${adminRoutes.tenant(tenantId)}/cards/${segment(cardId)}`,
  cardBalance: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/balance`,
  cardTimeline: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/timeline`,
  cardTransactions: (tenantId: string, cardId: string, query: AdminCardTransactionQuery, cursor?: string) =>
    `${adminRoutes.card(tenantId, cardId)}/transactions?${cardTransactionQuery(query, cursor)}`,
  freezeCard: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/freeze`,
  unfreezeCard: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/unfreeze`,
}
