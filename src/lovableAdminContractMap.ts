export const LOVABLE_ADMIN_ALLOWED_ENVIRONMENTS = ['SANDBOX', 'TEST'] as const

export type LovableAdminEnvironment = (typeof LOVABLE_ADMIN_ALLOWED_ENVIRONMENTS)[number]
export type LovableAdminContractStatus =
  | 'CONNECTED_READ_ONLY'
  | 'PARTIAL_READ_ONLY'
  | 'BLOCKED_MISSING_CONTRACT'

export type LovableAdminSurface =
  | '/admin/tenants'
  | '/admin/tenants/$tenantId'
  | '/admin/card-center'
  | '/admin/funds'
  | '/admin/treasury'
  | '/admin/ledger'
  | '/admin/end-users'
  | '/admin/products/$productId'
  | '/admin/chain-config'
  | '/admin/hot-wallets'

export type LovableAdminEndpoint = Readonly<{
  operationId: string
  method: 'GET'
  path: string
}>

export type LovableAdminContract = Readonly<{
  surface: LovableAdminSurface
  status: LovableAdminContractStatus
  environments: readonly LovableAdminEnvironment[]
  endpointTemplates: readonly string[]
  unmappedCapabilities: readonly string[]
}>

export type LovableAdminContractContext = Readonly<{
  tenantId: string
  environment: LovableAdminEnvironment
  cardId?: string
  userId?: string
}>

const allowedEnvironments = Object.freeze([...LOVABLE_ADMIN_ALLOWED_ENVIRONMENTS])
const relativeTenantPath = (tenantId: string) => `/admin/tenants/${encodeURIComponent(tenantId)}`
const environmentQuery = (environment: LovableAdminEnvironment) => `environment=${encodeURIComponent(environment)}`
const safeLookupId = /^[A-Za-z0-9_-]{2,128}$/

const requireTenantId = (value: string): string => {
  if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Lovable Admin contracts require a valid tenant identifier')
  }
  return value
}

const requireLookupId = (name: string, value: string | undefined): string => {
  if (!value || !safeLookupId.test(value)) throw new Error(`${name} requires a valid identifier`)
  return value
}

const contract = (
  surface: LovableAdminSurface,
  status: LovableAdminContractStatus,
  endpointTemplates: readonly string[],
  unmappedCapabilities: readonly string[] = [],
): LovableAdminContract => Object.freeze({
  surface,
  status,
  environments: allowedEnvironments,
  endpointTemplates: Object.freeze([...endpointTemplates]),
  unmappedCapabilities: Object.freeze([...unmappedCapabilities]),
})

export const LOVABLE_ADMIN_CONTRACTS: readonly LovableAdminContract[] = Object.freeze([
  contract('/admin/tenants', 'CONNECTED_READ_ONLY', ['/admin/tenants']),
  contract(
    '/admin/tenants/$tenantId',
    'PARTIAL_READ_ONLY',
    ['/admin/tenants/:tenantId', '/admin/tenants/:tenantId/integrations/readiness'],
    ['digital-asset capability writes', 'tenant fee-limit writes'],
  ),
  contract(
    '/admin/card-center',
    'PARTIAL_READ_ONLY',
    [
      '/admin/tenants/:tenantId/cards/:cardId/snapshot',
      '/admin/tenants/:tenantId/cards/:cardId/snapshot/balance',
      '/admin/tenants/:tenantId/cards/:cardId/snapshot/limits',
      '/admin/tenants/:tenantId/cards/:cardId/timeline?limit=25',
      '/admin/tenants/:tenantId/cards/:cardId/transactions?limit=25',
    ],
    ['card creation', 'product-template assignment', 'card fee override writes'],
  ),
  contract(
    '/admin/funds',
    'PARTIAL_READ_ONLY',
    [
      '/admin/tenants/:tenantId/wallet/operations?environment=:environment&limit=25&offset=0',
      '/admin/tenants/:tenantId/wallet/transactions?environment=:environment&limit=100',
    ],
    ['fund movement writes', 'digital-asset fee and referral settlement detail'],
  ),
  contract('/admin/treasury', 'CONNECTED_READ_ONLY', [
    '/admin/tenants/:tenantId/settlement/liquidity?environment=:environment',
    '/admin/tenants/:tenantId/settlement/reconciliation?environment=:environment',
    '/admin/tenants/:tenantId/settlement/trial-balance?environment=:environment',
    '/admin/tenants/:tenantId/settlement/daily-closing?environment=:environment',
  ]),
  contract(
    '/admin/ledger',
    'PARTIAL_READ_ONLY',
    [
      '/admin/tenants/:tenantId/ledger/accounts?environment=:environment',
      '/admin/tenants/:tenantId/ledger/journals?environment=:environment',
      '/admin/tenants/:tenantId/ledger/trial-balance?environment=:environment',
    ],
    ['digital-asset-specific fee and referral journal drill-down'],
  ),
  contract(
    '/admin/end-users',
    'PARTIAL_READ_ONLY',
    ['/admin/tenants/:tenantId/users/:userId/kyc?environment=:environment'],
    ['end-user list contract', 'digital-asset wallet detail contract'],
  ),
  contract('/admin/products/$productId', 'BLOCKED_MISSING_CONTRACT', [], [
    'product catalogue contract',
    'digital-asset product configuration contract',
  ]),
  contract('/admin/chain-config', 'BLOCKED_MISSING_CONTRACT', [], [
    'chain configuration read contract',
    'chain configuration write contract',
  ]),
  contract('/admin/hot-wallets', 'BLOCKED_MISSING_CONTRACT', [], [
    'hot-wallet inventory contract',
    'hot-wallet balance contract',
  ]),
])

export const assertLovableAdminEnvironment = (environment: string): LovableAdminEnvironment => {
  if (!(LOVABLE_ADMIN_ALLOWED_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new Error('Lovable Admin contracts are available only in SANDBOX or TEST')
  }
  return environment as LovableAdminEnvironment
}

const endpoint = (operationId: string, path: string): LovableAdminEndpoint => Object.freeze({
  operationId,
  method: 'GET',
  path,
})

export const resolveLovableAdminReadEndpoints = (
  surface: LovableAdminSurface,
  context: LovableAdminContractContext,
): readonly LovableAdminEndpoint[] => {
  const environment = assertLovableAdminEnvironment(context.environment)
  const tenantRoot = relativeTenantPath(requireTenantId(context.tenantId))
  switch (surface) {
    case '/admin/tenants':
      return Object.freeze([endpoint('listTenants', '/admin/tenants')])
    case '/admin/tenants/$tenantId':
      return Object.freeze([
        endpoint('getTenant', tenantRoot),
        endpoint('getTenantReadiness', `${tenantRoot}/integrations/readiness`),
      ])
    case '/admin/card-center': {
      const cardId = requireLookupId('Card Center', context.cardId)
      const cardRoot = `${tenantRoot}/cards/${encodeURIComponent(cardId)}`
      return Object.freeze([
        endpoint('getCardSnapshot', `${cardRoot}/snapshot`),
        endpoint('getCardBalanceSnapshot', `${cardRoot}/snapshot/balance`),
        endpoint('getCardLimitsSnapshot', `${cardRoot}/snapshot/limits`),
        endpoint('getCardTimeline', `${cardRoot}/timeline?limit=25`),
        endpoint('getCardTransactions', `${cardRoot}/transactions?limit=25`),
      ])
    }
    case '/admin/funds':
      return Object.freeze([
        endpoint('listWalletOperations', `${tenantRoot}/wallet/operations?${environmentQuery(environment)}&limit=25&offset=0`),
        endpoint('listWalletTransactions', `${tenantRoot}/wallet/transactions?${environmentQuery(environment)}&limit=100`),
      ])
    case '/admin/treasury':
      return Object.freeze([
        endpoint('getTreasuryLiquidity', `${tenantRoot}/settlement/liquidity?${environmentQuery(environment)}`),
        endpoint('getTreasuryReconciliation', `${tenantRoot}/settlement/reconciliation?${environmentQuery(environment)}`),
        endpoint('getTreasuryTrialBalance', `${tenantRoot}/settlement/trial-balance?${environmentQuery(environment)}`),
        endpoint('getTreasuryDailyClosing', `${tenantRoot}/settlement/daily-closing?${environmentQuery(environment)}`),
      ])
    case '/admin/ledger':
      return Object.freeze([
        endpoint('listLedgerAccounts', `${tenantRoot}/ledger/accounts?${environmentQuery(environment)}`),
        endpoint('listLedgerJournals', `${tenantRoot}/ledger/journals?${environmentQuery(environment)}`),
        endpoint('getLedgerTrialBalance', `${tenantRoot}/ledger/trial-balance?${environmentQuery(environment)}`),
      ])
    case '/admin/end-users': {
      const userId = requireLookupId('End Users', context.userId)
      return Object.freeze([
        endpoint('getAdminKyc', `${tenantRoot}/users/${encodeURIComponent(userId)}/kyc?${environmentQuery(environment)}`),
      ])
    }
    case '/admin/products/$productId':
    case '/admin/chain-config':
    case '/admin/hot-wallets':
      return Object.freeze([])
  }
}
