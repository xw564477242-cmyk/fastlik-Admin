export type DataSource = 'SANDBOX' | 'UAT' | 'PRODUCTION'

const segment = (value: string) => encodeURIComponent(value)
const environmentQuery = (environment: DataSource) =>
  `environment=${encodeURIComponent(environment)}`

export const adminRoutes = {
  tenant: (tenantId: string) =>
    `/admin/tenants/${segment(tenantId)}`,
  readiness: (tenantId: string) =>
    `${adminRoutes.tenant(tenantId)}/integrations/readiness`,
  walletOperations: (tenantId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/operations?${environmentQuery(environment)}&limit=100`,
  walletTransactions: (tenantId: string, environment: DataSource) =>
    `${adminRoutes.tenant(tenantId)}/wallet/transactions?${environmentQuery(environment)}&limit=100`,
  card: (tenantId: string, cardId: string) =>
    `${adminRoutes.tenant(tenantId)}/cards/${segment(cardId)}`,
  cardBalance: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/balance`,
  cardTimeline: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/timeline`,
  freezeCard: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/freeze`,
  unfreezeCard: (tenantId: string, cardId: string) =>
    `${adminRoutes.card(tenantId, cardId)}/unfreeze`,
}
