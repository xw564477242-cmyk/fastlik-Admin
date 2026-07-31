import type { DataSource } from './adminRoutes'

const OPERATION_TYPES = ['DEPOSIT', 'INTERNAL_TRANSFER', 'WITHDRAWAL', 'TREASURY_RESERVE', 'FX_CONVERSION'] as const
const OPERATION_STATUSES = ['PROCESSING', 'PENDING_SETTLEMENT', 'COMPLETED', 'FAILED'] as const
const JOURNAL_STATUSES = ['POSTED', 'REVERSED'] as const
const ENTRY_SIDES = ['DEBIT', 'CREDIT'] as const
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d{1,18})?$/
const ASSET = /^[A-Z0-9]{3,12}$/

type OperationType = typeof OPERATION_TYPES[number]
type OperationStatus = typeof OPERATION_STATUSES[number]
type JsonRecord = Record<string, unknown>

export type WalletOperationDetail = {
  operation: {
    id: string
    type: OperationType
    status: OperationStatus
    assetCode: string
    amount: string
    sourceAccountId: string | null
    destinationAccountId: string | null
    journalCount: number
  }
  accounts: Array<{
    id: string
    accountCode: string
    assetCode: string
    postedBalance: string
    pendingBalance: string
  }>
  journals: Array<{
    id: string
    status: typeof JOURNAL_STATUSES[number]
    referenceType: string
    entryCount: number
    debitEntries: number
    creditEntries: number
    assetCodes: string
  }>
  treasury: null | {
    assetCode: string
    sponsorReserve: string
    requiredReserve: string
    availableBalance: string
    authorizationHold: string
    pendingSettlement: string
  }
}

export class WalletOperationContractError extends Error {
  readonly name = 'WalletOperationContractError'
}

const fail = (path: string, reason: string): never => {
  throw new WalletOperationContractError(`${path}: ${reason}`)
}

const record = (value: unknown, path: string): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : fail(path, 'expected object')

const array = (value: unknown, path: string, max: number): unknown[] => {
  if (!Array.isArray(value)) fail(path, 'expected array')
  if (value.length > max) fail(path, `exceeds maximum ${max}`)
  return value
}

const text = (value: unknown, path: string, max = 256): string => {
  if (typeof value !== 'string' || !value.length || value.length > max) fail(path, `expected 1-${max} character string`)
  return value
}

const nullableText = (value: unknown, path: string): string | null =>
  value === null ? null : text(value, path)

const decimal = (value: unknown, path: string, positive = false): string => {
  if (typeof value !== 'string' || !DECIMAL.test(value)) fail(path, 'expected decimal string with at most 18 fractional digits')
  if (positive && (value.startsWith('-') || /^0(?:\.0+)?$/.test(value))) fail(path, 'expected positive decimal')
  return value
}

const asset = (value: unknown, path: string): string => {
  const result = text(value, path, 12)
  return ASSET.test(result) ? result : fail(path, 'expected uppercase asset code')
}

const member = <T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] => {
  const result = text(value, path, 64)
  return allowed.includes(result as T[number]) ? result as T[number] : fail(path, `unsupported value ${result}`)
}

export function parseWalletOperationDetail(
  value: unknown,
  expected: { operationId: string; tenantId: string; environment: DataSource },
): WalletOperationDetail {
  const root = record(value, 'response')
  const operation = record(root.operation, 'operation')
  const operationId = text(operation.id, 'operation.id')
  if (operationId !== expected.operationId) fail('operation.id', 'does not match requested operation')
  if (text(operation.tenantId, 'operation.tenantId') !== expected.tenantId) fail('operation.tenantId', 'does not match selected tenant')
  if (member(operation.environment, ['SANDBOX', 'TEST', 'UAT', 'PRODUCTION'] as const, 'operation.environment') !== expected.environment) {
    fail('operation.environment', 'does not match selected environment')
  }
  const operationAsset = asset(operation.assetCode, 'operation.assetCode')
  const sourceAccountId = nullableText(operation.sourceAccountId, 'operation.sourceAccountId')
  const destinationAccountId = nullableText(operation.destinationAccountId, 'operation.destinationAccountId')

  const journalIds = array(operation.journalIds, 'operation.journalIds', 100).map((item, index) =>
    text(item, `operation.journalIds[${index}]`))
  if (new Set(journalIds).size !== journalIds.length) fail('operation.journalIds', 'contains duplicate IDs')

  const accounts = array(root.accounts, 'accounts', 2).map((item, index) => {
    const account = record(item, `accounts[${index}]`)
    return {
      id: text(account.id, `accounts[${index}].id`),
      accountCode: text(account.accountCode, `accounts[${index}].accountCode`, 128),
      assetCode: asset(account.assetCode, `accounts[${index}].assetCode`),
      postedBalance: decimal(account.postedBalance, `accounts[${index}].postedBalance`),
      pendingBalance: decimal(account.pendingBalance, `accounts[${index}].pendingBalance`),
    }
  })
  const expectedAccountIds = [...new Set([sourceAccountId, destinationAccountId].filter((id): id is string => Boolean(id)))]
  const accountIds = accounts.map((account) => account.id)
  if (
    new Set(accountIds).size !== accountIds.length ||
    accountIds.length !== expectedAccountIds.length ||
    accountIds.some((id) => !expectedAccountIds.includes(id))
  ) fail('accounts', 'does not match operation source/destination accounts')

  let totalEntries = 0
  const journals = array(root.journals, 'journals', 100).map((item, index) => {
    const journal = record(item, `journals[${index}]`)
    const id = text(journal.id, `journals[${index}].id`)
    if (!journalIds.includes(id)) fail(`journals[${index}].id`, 'not declared by operation.journalIds')
    const entries = array(journal.entries, `journals[${index}].entries`, 500).map((entryValue, entryIndex) => {
      const entry = record(entryValue, `journals[${index}].entries[${entryIndex}]`)
      return {
        side: member(entry.side, ENTRY_SIDES, `journals[${index}].entries[${entryIndex}].side`),
        assetCode: asset(entry.assetCode, `journals[${index}].entries[${entryIndex}].assetCode`),
        amount: decimal(entry.amount, `journals[${index}].entries[${entryIndex}].amount`, true),
        walletAccountId: text(entry.walletAccountId, `journals[${index}].entries[${entryIndex}].walletAccountId`),
      }
    })
    totalEntries += entries.length
    if (totalEntries > 1000) fail('journals.entries', 'exceeds maximum 1000')
    return {
      id,
      status: member(journal.status, JOURNAL_STATUSES, `journals[${index}].status`),
      referenceType: text(journal.referenceType, `journals[${index}].referenceType`, 128),
      entryCount: entries.length,
      debitEntries: entries.filter((entry) => entry.side === 'DEBIT').length,
      creditEntries: entries.filter((entry) => entry.side === 'CREDIT').length,
      assetCodes: [...new Set(entries.map((entry) => entry.assetCode))].join(', '),
    }
  })
  if (journals.length !== journalIds.length) fail('journals', 'does not match operation.journalIds')

  const treasuryValue = root.treasury
  const treasury = treasuryValue === null ? null : (() => {
    const item = record(treasuryValue, 'treasury')
    const treasuryAsset = asset(item.assetCode, 'treasury.assetCode')
    if (treasuryAsset !== operationAsset) fail('treasury.assetCode', 'does not match operation asset')
    return {
      assetCode: treasuryAsset,
      sponsorReserve: decimal(item.sponsorReserve, 'treasury.sponsorReserve'),
      requiredReserve: decimal(item.requiredReserve, 'treasury.requiredReserve'),
      availableBalance: decimal(item.availableBalance, 'treasury.availableBalance'),
      authorizationHold: decimal(item.authorizationHold, 'treasury.authorizationHold'),
      pendingSettlement: decimal(item.pendingSettlement, 'treasury.pendingSettlement'),
    }
  })()

  return {
    operation: {
      id: operationId,
      type: member(operation.type, OPERATION_TYPES, 'operation.type'),
      status: member(operation.status, OPERATION_STATUSES, 'operation.status'),
      assetCode: operationAsset,
      amount: decimal(operation.amount, 'operation.amount', true),
      sourceAccountId,
      destinationAccountId,
      journalCount: journalIds.length,
    },
    accounts,
    journals,
    treasury,
  }
}
