import type { AdminSession } from './productionApi'

export const MAX_WALLET_ASSET_SUMMARY_JSON_BYTES = 128 * 1024
export const MAX_WALLET_ASSET_SUMMARY_ROWS = 100

export type WalletAssetSummaryEnvironment = 'SANDBOX' | 'TEST'
export type WalletAssetSummaryRow = Readonly<{
  assetCode: string
  accountCount: number
  currentBalance: string
  postedBalance: string
  pendingBalance: string
  holdBalance: string
  availableBalance: string
}>
export type WalletAssetSummary = Readonly<{
  tenantId: string
  environment: WalletAssetSummaryEnvironment
  customerId: string | null
  assets: readonly WalletAssetSummaryRow[]
}>

const identifier = /^[A-Za-z0-9_-]{2,100}$/
const assetCode = /^[A-Z0-9]{2,12}$/
const decimal = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/
const rootKeys = ['assets', 'customerId', 'environment', 'tenantId']
const rowKeys = ['accountCount', 'assetCode', 'availableBalance', 'currentBalance', 'holdBalance', 'pendingBalance', 'postedBalance']

const isPlainRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype,
)
const hasExactKeys = (record: Record<string, unknown>, keys: readonly string[]) => Object.keys(record).sort().join('\u0000') === [...keys].sort().join('\u0000')

export class WalletAssetSummaryContractError extends Error {}

const fail = (): never => { throw new WalletAssetSummaryContractError('Wallet asset summary response could not be verified') }

export function parseWalletAssetSummaryResponse(
  raw: string,
  expected: Readonly<{ tenantId: string; environment: WalletAssetSummaryEnvironment; customerId?: string }>,
): WalletAssetSummary {
  let value: unknown
  try { value = JSON.parse(raw) } catch { fail() }
  if (!isPlainRecord(value) || !hasExactKeys(value, rootKeys)) fail()
  if (value.tenantId !== expected.tenantId || value.environment !== expected.environment) {
    throw new WalletAssetSummaryContractError('Wallet asset summary does not match the selected tenant and environment')
  }
  const expectedCustomer = expected.customerId ?? null
  if (value.customerId !== expectedCustomer || (value.customerId !== null && (typeof value.customerId !== 'string' || !identifier.test(value.customerId)))) fail()
  if (!Array.isArray(value.assets)) fail()
  if (value.assets.length > MAX_WALLET_ASSET_SUMMARY_ROWS) throw new WalletAssetSummaryContractError('Wallet asset summary exceeds the local safety limit')
  let previous = ''
  const assets = value.assets.map((candidate) => {
    if (!isPlainRecord(candidate) || !hasExactKeys(candidate, rowKeys)) fail()
    if (typeof candidate.assetCode !== 'string' || !assetCode.test(candidate.assetCode) || candidate.assetCode <= previous) fail()
    previous = candidate.assetCode
    if (!Number.isSafeInteger(candidate.accountCount) || Number(candidate.accountCount) < 0) fail()
    for (const key of ['currentBalance', 'postedBalance', 'pendingBalance', 'holdBalance', 'availableBalance'] as const) {
      if (typeof candidate[key] !== 'string' || !decimal.test(candidate[key])) fail()
    }
    return Object.freeze({
      assetCode: candidate.assetCode,
      accountCount: candidate.accountCount as number,
      currentBalance: candidate.currentBalance as string,
      postedBalance: candidate.postedBalance as string,
      pendingBalance: candidate.pendingBalance as string,
      holdBalance: candidate.holdBalance as string,
      availableBalance: candidate.availableBalance as string,
    })
  })
  return Object.freeze({
    tenantId: value.tenantId as string,
    environment: value.environment as WalletAssetSummaryEnvironment,
    customerId: value.customerId as string | null,
    assets: Object.freeze(assets),
  })
}

export const walletAssetSummarySessionReadAllowed = (
  session: AdminSession,
  environment: string,
  now: number,
): boolean => (environment === 'SANDBOX' || environment === 'TEST')
  && session.user.environment === environment
  && Date.parse(session.expiresAt) > now
