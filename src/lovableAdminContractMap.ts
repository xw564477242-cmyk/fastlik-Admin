export const LOVABLE_ADMIN_ALLOWED_ENVIRONMENTS = ['SANDBOX', 'TEST'] as const

export type LovableAdminEnvironment = (typeof LOVABLE_ADMIN_ALLOWED_ENVIRONMENTS)[number]
export type LovableAdminContractStatus =
  | 'CONNECTED_READ_WRITE'
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
  method: 'GET' | 'POST' | 'PUT'
  path: string
}>

export type LovableAdminReadRequest = Readonly<{
  endpoint: LovableAdminEndpoint
  adminBearer: string
  signal?: AbortSignal
}>

export type LovableAdminWriteRequest = Readonly<{
  endpoint: LovableAdminEndpoint
  adminBearer: string
  body: Readonly<Record<string, unknown>>
  signal?: AbortSignal
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
const relativeTenantPath = (tenantId: string) => `/api/admin/tenants/${encodeURIComponent(tenantId)}`
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
  contract('/admin/tenants', 'CONNECTED_READ_WRITE', ['/api/admin/tenants']),
  contract(
    '/admin/tenants/$tenantId',
    'CONNECTED_READ_WRITE',
    ['/api/admin/tenants/:id', '/api/admin/tenants/:tenantId/integrations/readiness', '/api/admin/tenants/:tenantId/card-products'],
    ['digital-asset capability writes', 'tenant fee-limit writes'],
  ),
  contract(
    '/admin/card-center',
    'CONNECTED_READ_WRITE',
    [
      '/api/admin/tenants/:tenantId/cards/:cardId/snapshot',
      '/api/admin/tenants/:tenantId/cards/:cardId/snapshot/balance',
      '/api/admin/tenants/:tenantId/cards/:cardId/snapshot/limits',
      '/api/admin/tenants/:tenantId/cards/:cardId/timeline?limit=25',
      '/api/admin/tenants/:tenantId/cards/:cardId/transactions?limit=25',
      '/api/admin/tenants/:tenantId/card-products',
      '/api/admin/tenants/:tenantId/card-applications',
      '/api/admin/tenants/:tenantId/cards/:cardId/fees',
    ],
  ),
  contract(
    '/admin/funds',
    'PARTIAL_READ_ONLY',
    [
      '/api/admin/tenants/:tenantId/wallet/operations?environment=:environment&limit=25&offset=0',
      '/api/admin/tenants/:tenantId/wallet/transactions?environment=:environment&limit=100',
    ],
    ['fund movement writes', 'digital-asset fee and referral settlement detail'],
  ),
  contract('/admin/treasury', 'CONNECTED_READ_ONLY', [
    '/api/admin/tenants/:tenantId/settlement/liquidity?environment=:environment',
    '/api/admin/tenants/:tenantId/settlement/reconciliation?environment=:environment',
    '/api/admin/tenants/:tenantId/settlement/trial-balance?environment=:environment',
    '/api/admin/tenants/:tenantId/settlement/daily-closing?environment=:environment',
  ]),
  contract(
    '/admin/ledger',
    'PARTIAL_READ_ONLY',
    [
      '/api/admin/tenants/:tenantId/ledger/accounts?environment=:environment',
      '/api/admin/tenants/:tenantId/ledger/journals?environment=:environment',
      '/api/admin/tenants/:tenantId/ledger/trial-balance?environment=:environment',
    ],
    ['digital-asset-specific fee and referral journal drill-down'],
  ),
  contract(
    '/admin/end-users',
    'PARTIAL_READ_ONLY',
    ['/api/admin/tenants/:tenantId/users/:userId/kyc?environment=:environment'],
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

const endpoint = (operationId: string, path: string, method: LovableAdminEndpoint['method'] = 'GET'): LovableAdminEndpoint => Object.freeze({
  operationId,
  method,
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
      return Object.freeze([endpoint('listTenants', '/api/admin/tenants')])
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

export const resolveLovableAdminWriteEndpoint = (
  operation: 'createTenant' | 'createCardProductTemplate' | 'createCardApplication' | 'setCardFeeMode',
  context: LovableAdminContractContext,
): LovableAdminEndpoint => {
  assertLovableAdminEnvironment(context.environment)
  if (context.environment !== 'SANDBOX') throw new Error('Phase 1 Admin writes are restricted to SANDBOX')
  if (operation === 'createTenant') return endpoint(operation, '/api/admin/tenants', 'POST')
  const tenantRoot = relativeTenantPath(requireTenantId(context.tenantId))
  if (operation === 'createCardProductTemplate') return endpoint(operation, `${tenantRoot}/card-products`, 'POST')
  if (operation === 'createCardApplication') return endpoint(operation, `${tenantRoot}/card-applications`, 'POST')
  const cardId = requireLookupId('Card fee configuration', context.cardId)
  return endpoint(operation, `${tenantRoot}/cards/${encodeURIComponent(cardId)}/fees`, 'PUT')
}

export const requestLovableAdminReadEndpoint = async (
  request: LovableAdminReadRequest,
  requester: typeof fetch = fetch,
): Promise<unknown> => {
  const token = request.adminBearer.trim()
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new Error('Lovable Admin real API requests require a valid administrator bearer')
  }
  if (request.endpoint.method !== 'GET' || !request.endpoint.path.startsWith('/api/admin/')) {
    throw new Error('Lovable Admin real API requests are restricted to mapped read-only Admin endpoints')
  }
  const response = await requester(request.endpoint.path, {
    method: 'GET',
    headers: Object.freeze({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: request.signal,
  })
  if (!response.ok) {
    throw new Error(`FastLink Admin API request failed with HTTP ${response.status}`)
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('FastLink Admin API returned a non-JSON response')
  }
  return response.json()
}

export const requestLovableAdminWriteEndpoint = async (
  request: LovableAdminWriteRequest,
  requester: typeof fetch = fetch,
): Promise<unknown> => {
  const token = request.adminBearer.trim()
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('Lovable Admin real API requests require a valid administrator bearer')
  if ((request.endpoint.method !== 'POST' && request.endpoint.method !== 'PUT') || !request.endpoint.path.startsWith('/api/admin/')) {
    throw new Error('Lovable Admin write request is not mapped to an approved Admin endpoint')
  }
  const response = await requester(request.endpoint.path, {
    method: request.endpoint.method,
    headers: Object.freeze({ Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: request.signal,
    body: JSON.stringify(request.body),
  })
  if (!response.ok) throw new Error(`FastLink Admin API request failed with HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('FastLink Admin API returned a non-JSON response')
  return response.json()
}
