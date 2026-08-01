import type { DataSource } from './adminRoutes.ts'

export const MAX_TREASURY_RECONCILIATION_JSON_BYTES = 524_288
export const MAX_TREASURY_RECONCILIATION_JSON_DEPTH = 16
export const MAX_TREASURY_RECONCILIATION_ROWS = 200

const RECONCILIATION_FIELDS = Object.freeze([
  'generatedAt',
  'dataSource',
  'status',
  'evidencePresent',
  'pendingChecks',
  'authorizationHoldChecks',
  'clearingDifferenceChecks',
  'journalChecks',
  'trialBalance',
  'externalReconciliation',
] as const)
const DAILY_CLOSING_FIELDS = Object.freeze([
  'reportType',
  'generatedAt',
  'businessDate',
  'dataSource',
  'status',
  'internalFinancialStatus',
  'externalReconciliationStatus',
  'activity',
  'trialBalance',
  'treasuryReconciliation',
  'settlementReconciliation',
  'externalChecks',
  'blockers',
] as const)

export type TreasuryBalance = Readonly<{
  assetCode: string
  debit: string
  credit: string
  balanced: boolean
}>

export type TreasuryReconciliationSummary = Readonly<{
  generatedAt: string
  status: 'MATCHED' | 'DISCREPANCY' | 'NO_DATA'
  evidencePresent: boolean
  imbalanceCount: number
  exceptionCount: number
  assetCount: number
}>

export type TreasuryClosingBlocker = 'INTERNAL_RECONCILIATION' | 'EXTERNAL_EVIDENCE'

export type TreasuryDailyClosingSummary = Readonly<{
  generatedAt: string
  businessDate: string
  status: 'PASS' | 'BLOCKED'
  internalFinancialStatus: 'PASS' | 'BLOCKED'
  externalReconciliationStatus: 'PASS' | 'BLOCKED'
  activity: Readonly<{
    walletOperations: number
    merchantPayments: number
    cardTransactions: number
    journals: number
    auditEvents: number
  }>
  closingBlockers: readonly TreasuryClosingBlocker[]
  blockerCount: number
}>

type ContractCode =
  | 'INVALID_RECONCILIATION'
  | 'INVALID_TRIAL_BALANCE'
  | 'INVALID_DAILY_CLOSING'
  | 'ENVIRONMENT_MISMATCH'
  | 'RESPONSE_LIMIT_EXCEEDED'

export class TreasuryReconciliationContractError extends Error {
  readonly code: ContractCode

  constructor(code: ContractCode) {
    super({
      INVALID_RECONCILIATION: 'Treasury reconciliation response could not be verified',
      INVALID_TRIAL_BALANCE: 'Treasury trial balance response could not be verified',
      INVALID_DAILY_CLOSING: 'Treasury daily closing response could not be verified',
      ENVIRONMENT_MISMATCH: 'Treasury response does not match the selected environment',
      RESPONSE_LIMIT_EXCEEDED: 'Treasury response exceeds the local safety limit',
    }[code])
    this.code = code
    this.name = 'TreasuryReconciliationContractError'
  }
}

type OwnData = Readonly<Record<string, PropertyDescriptor>>
const invalid = (code: ContractCode): never => { throw new TreasuryReconciliationContractError(code) }

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
      if (depth > MAX_TREASURY_RECONCILIATION_JSON_DEPTH) return false
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return !inString && !escaped && depth === 0
}

const boundedJson = (wireValue: unknown, code: ContractCode): unknown => {
  if (typeof wireValue !== 'string' || wireValue.length === 0) invalid(code)
  if (
    wireValue.length > MAX_TREASURY_RECONCILIATION_JSON_BYTES
    || new TextEncoder().encode(wireValue).byteLength > MAX_TREASURY_RECONCILIATION_JSON_BYTES
  ) invalid('RESPONSE_LIMIT_EXCEEDED')
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

const oneOf = <T extends string>(source: OwnData, key: string, values: readonly T[], code: ContractCode): T => {
  const value = text(source, key, 64, code)
  return values.includes(value as T) ? value as T : invalid(code)
}

const bool = (source: OwnData, key: string, code: ContractCode): boolean => {
  const value = ownValue(source, key)
  return typeof value === 'boolean' ? value : invalid(code)
}

const nonNegativeInteger = (source: OwnData, key: string, code: ContractCode): number => {
  const value = ownValue(source, key)
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid(code)
}

const timestamp = (source: OwnData, key: string, code: ContractCode): string => {
  const value = text(source, key, 32, code)
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value ? value : invalid(code)
}

const businessDate = (source: OwnData, key: string, code: ContractCode): string => {
  const value = text(source, key, 10, code)
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : invalid(code)
}

const decimal = (source: OwnData, key: string, code: ContractCode): string => {
  const value = text(source, key, 80, code)
  return /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) ? value : invalid(code)
}

const assetCode = (source: OwnData, code: ContractCode): string => {
  const value = text(source, 'assetCode', 12, code)
  return /^[A-Z0-9]{3,12}$/.test(value) ? value : invalid(code)
}

const boundedArray = (value: unknown, code: ContractCode): readonly unknown[] => {
  if (!Array.isArray(value)) invalid(code)
  if (value.length > MAX_TREASURY_RECONCILIATION_ROWS) invalid('RESPONSE_LIMIT_EXCEEDED')
  return value
}

const parseTrialBalanceRows = (value: unknown, code: ContractCode): readonly TreasuryBalance[] => {
  const rows = boundedArray(value, code).map((entry) => {
    const source = ownData(entry, code)
    exactFields(source, ['assetCode', 'debit', 'credit', 'balanced'], code)
    return Object.freeze({
      assetCode: assetCode(source, code),
      debit: decimal(source, 'debit', code),
      credit: decimal(source, 'credit', code),
      balanced: bool(source, 'balanced', code),
    })
  })
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.assetCode)) invalid(code)
    seen.add(row.assetCode)
  }
  return Object.freeze(rows)
}

type MatchedCheck = Readonly<{ assetCode: string; matched: boolean; positionMissing?: boolean }>

const parsePendingChecks = (value: unknown, code: ContractCode): readonly MatchedCheck[] => Object.freeze(
  boundedArray(value, code).map((entry) => {
    const source = ownData(entry, code)
    exactFields(source, ['assetCode', 'positionMissing', 'expectedPendingSettlement', 'treasuryPendingSettlement', 'difference', 'matched'], code)
    decimal(source, 'expectedPendingSettlement', code)
    decimal(source, 'treasuryPendingSettlement', code)
    decimal(source, 'difference', code)
    return Object.freeze({ assetCode: assetCode(source, code), positionMissing: bool(source, 'positionMissing', code), matched: bool(source, 'matched', code) })
  }),
)

const parseAuthorizationChecks = (value: unknown, code: ContractCode): readonly MatchedCheck[] => Object.freeze(
  boundedArray(value, code).map((entry) => {
    const source = ownData(entry, code)
    exactFields(source, ['assetCode', 'positionMissing', 'expectedAuthorizationHold', 'treasuryAuthorizationHold', 'difference', 'matched'], code)
    decimal(source, 'expectedAuthorizationHold', code)
    decimal(source, 'treasuryAuthorizationHold', code)
    decimal(source, 'difference', code)
    return Object.freeze({ assetCode: assetCode(source, code), positionMissing: bool(source, 'positionMissing', code), matched: bool(source, 'matched', code) })
  }),
)

const parseClearingChecks = (value: unknown, code: ContractCode): readonly MatchedCheck[] => Object.freeze(
  boundedArray(value, code).map((entry) => {
    const source = ownData(entry, code)
    exactFields(source, ['assetCode', 'clearingDifference', 'expectedAuthorizationHold', 'matched'], code)
    decimal(source, 'clearingDifference', code)
    decimal(source, 'expectedAuthorizationHold', code)
    return Object.freeze({ assetCode: assetCode(source, code), matched: bool(source, 'matched', code) })
  }),
)

const parseJournalChecks = (value: unknown, code: ContractCode): readonly MatchedCheck[] => Object.freeze(
  boundedArray(value, code).map((entry) => {
    const source = ownData(entry, code)
    exactFields(source, ['assetCode', 'debit', 'credit', 'matched'], code)
    decimal(source, 'debit', code)
    decimal(source, 'credit', code)
    return Object.freeze({ assetCode: assetCode(source, code), matched: bool(source, 'matched', code) })
  }),
)

const parseExternalReconciliation = (value: unknown, code: ContractCode): number => {
  const source = ownData(value, code)
  exactFields(source, ['bank', 'processor'], code)
  let blocked = 0
  for (const key of ['bank', 'processor']) {
    const row = ownData(ownValue(source, key), code)
    exactFields(row, ['status', 'blocker'], code)
    if (oneOf(row, 'status', ['BLOCKED'] as const, code) === 'BLOCKED') blocked += 1
    text(row, 'blocker', 500, code)
  }
  return blocked
}

export function parseTreasuryTrialBalance(wireValue: unknown): readonly TreasuryBalance[] {
  return parseTrialBalanceRows(boundedJson(wireValue, 'INVALID_TRIAL_BALANCE'), 'INVALID_TRIAL_BALANCE')
}

export function parseTreasuryReconciliation(
  wireValue: unknown,
  expectedEnvironment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
): TreasuryReconciliationSummary {
  const code = 'INVALID_RECONCILIATION' as const
  const source = ownData(boundedJson(wireValue, code), code)
  exactFields(source, RECONCILIATION_FIELDS, code)
  if (text(source, 'dataSource', 16, code) !== expectedEnvironment) invalid('ENVIRONMENT_MISMATCH')
  const status = oneOf(source, 'status', ['MATCHED', 'DISCREPANCY', 'NO_DATA'] as const, code)
  const evidencePresent = bool(source, 'evidencePresent', code)
  const pending = parsePendingChecks(ownValue(source, 'pendingChecks'), code)
  const authorization = parseAuthorizationChecks(ownValue(source, 'authorizationHoldChecks'), code)
  const clearing = parseClearingChecks(ownValue(source, 'clearingDifferenceChecks'), code)
  const journals = parseJournalChecks(ownValue(source, 'journalChecks'), code)
  const trial = parseTrialBalanceRows(ownValue(source, 'trialBalance'), code)
  const externalBlocked = parseExternalReconciliation(ownValue(source, 'externalReconciliation'), code)
  const checks = [...pending, ...authorization, ...clearing, ...journals]
  const allMatched = evidencePresent && checks.every((row) => row.matched) && trial.every((row) => row.balanced)
  if (
    (status === 'MATCHED' && !allMatched)
    || (status === 'DISCREPANCY' && (!evidencePresent || allMatched))
    || (status === 'NO_DATA' && evidencePresent)
  ) invalid(code)
  const assets = new Set([...checks.map((row) => row.assetCode), ...trial.map((row) => row.assetCode)])
  return Object.freeze({
    generatedAt: timestamp(source, 'generatedAt', code),
    status,
    evidencePresent,
    imbalanceCount: checks.filter((row) => !row.matched).length + trial.filter((row) => !row.balanced).length,
    exceptionCount: checks.filter((row) => row.positionMissing).length + externalBlocked,
    assetCount: assets.size,
  })
}

const parseDailyTreasury = (value: unknown, code: ContractCode): void => {
  const source = ownData(value, code)
  exactFields(source, ['pendingChecks', 'authorizationHoldChecks', 'clearingDifferenceChecks'], code)
  parsePendingChecks(ownValue(source, 'pendingChecks'), code)
  parseAuthorizationChecks(ownValue(source, 'authorizationHoldChecks'), code)
  parseClearingChecks(ownValue(source, 'clearingDifferenceChecks'), code)
}

const parseExternalChecks = (value: unknown, code: ContractCode): void => {
  const expected = new Set(['bank-reconciliation', 'processor-reconciliation', 'settlement-reconciliation'])
  const rows = boundedArray(value, code)
  if (rows.length !== expected.size) invalid(code)
  for (const entry of rows) {
    const source = ownData(entry, code)
    exactFields(source, ['operation', 'evidence'], code)
    const operation = text(source, 'operation', 64, code)
    if (!expected.delete(operation)) invalid(code)
    const evidence = ownValue(source, 'evidence')
    if (evidence === null) continue
    const artifact = ownData(evidence, code)
    exactFields(artifact, ['operation', 'result', 'capturedAt', 'contentHash'], code)
    if (text(artifact, 'operation', 64, code) !== operation) invalid(code)
    oneOf(artifact, 'result', ['PASS', 'FAIL', 'BLOCKED'] as const, code)
    timestamp(artifact, 'capturedAt', code)
    if (!/^[a-f0-9]{64}$/.test(text(artifact, 'contentHash', 64, code))) invalid(code)
  }
  if (expected.size) invalid(code)
}

const classifyClosingBlockers = (value: unknown, code: ContractCode): readonly TreasuryClosingBlocker[] => {
  const blockers = boundedArray(value, code)
  const safe = new Set<TreasuryClosingBlocker>()
  for (const blocker of blockers) {
    if (blocker === 'Internal financial reconciliation is not MATCHED') safe.add('INTERNAL_RECONCILIATION')
    else if (
      typeof blocker === 'string'
      && /^Missing PASS evidence: (bank-reconciliation|processor-reconciliation|settlement-reconciliation)$/.test(blocker)
    ) safe.add('EXTERNAL_EVIDENCE')
    else invalid(code)
  }
  return Object.freeze([...safe])
}

export function parseTreasuryDailyClosing(
  wireValue: unknown,
  expectedEnvironment: Extract<DataSource, 'SANDBOX' | 'TEST'>,
): TreasuryDailyClosingSummary {
  const code = 'INVALID_DAILY_CLOSING' as const
  const source = ownData(boundedJson(wireValue, code), code)
  exactFields(source, DAILY_CLOSING_FIELDS, code)
  if (text(source, 'reportType', 64, code) !== 'FINANCIAL_OPERATIONAL_REPORT') invalid(code)
  if (text(source, 'dataSource', 16, code) !== expectedEnvironment) invalid('ENVIRONMENT_MISMATCH')
  const status = oneOf(source, 'status', ['PASS', 'BLOCKED'] as const, code)
  const internalFinancialStatus = oneOf(source, 'internalFinancialStatus', ['PASS', 'BLOCKED'] as const, code)
  const externalReconciliationStatus = oneOf(source, 'externalReconciliationStatus', ['PASS', 'BLOCKED'] as const, code)
  if ((status === 'PASS') !== (internalFinancialStatus === 'PASS' && externalReconciliationStatus === 'PASS')) invalid(code)
  const activitySource = ownData(ownValue(source, 'activity'), code)
  exactFields(activitySource, ['walletOperations', 'merchantPayments', 'cardTransactions', 'journals', 'auditEvents'], code)
  const activity = Object.freeze({
    walletOperations: nonNegativeInteger(activitySource, 'walletOperations', code),
    merchantPayments: nonNegativeInteger(activitySource, 'merchantPayments', code),
    cardTransactions: nonNegativeInteger(activitySource, 'cardTransactions', code),
    journals: nonNegativeInteger(activitySource, 'journals', code),
    auditEvents: nonNegativeInteger(activitySource, 'auditEvents', code),
  })
  parseTrialBalanceRows(ownValue(source, 'trialBalance'), code)
  parseDailyTreasury(ownValue(source, 'treasuryReconciliation'), code)
  parseJournalChecks(ownValue(source, 'settlementReconciliation'), code)
  parseExternalChecks(ownValue(source, 'externalChecks'), code)
  const rawBlockers = boundedArray(ownValue(source, 'blockers'), code)
  const closingBlockers = classifyClosingBlockers(rawBlockers, code)
  if ((status === 'PASS' && rawBlockers.length !== 0) || (status === 'BLOCKED' && rawBlockers.length === 0)) invalid(code)
  return Object.freeze({
    generatedAt: timestamp(source, 'generatedAt', code),
    businessDate: businessDate(source, 'businessDate', code),
    status,
    internalFinancialStatus,
    externalReconciliationStatus,
    activity,
    closingBlockers,
    blockerCount: rawBlockers.length,
  })
}

type TreasurySession = Readonly<{
  accessToken: string
  expiresAt: string
  user: Readonly<{
    id: string
    tenantId: string
    environment: DataSource
    roles: readonly string[]
    permissions: readonly string[]
  }>
}>

export const treasuryDashboardScope = (
  session: TreasurySession,
  tenantId: string,
  environment: DataSource,
): string => JSON.stringify(Object.freeze({
  actorId: session.user.id,
  sessionExpiresAt: session.expiresAt,
  homeTenantId: session.user.tenantId,
  tenantId,
  environment,
  roles: [...session.user.roles].sort(),
  permissions: [...session.user.permissions].sort(),
}))

export const treasurySessionReadAllowed = (
  session: TreasurySession,
  environment: DataSource,
  now: number,
): boolean => {
  const expiresAt = Date.parse(session.expiresAt)
  return (environment === 'SANDBOX' || environment === 'TEST')
    && session.user.environment === environment
    && session.accessToken.length > 0
    && session.user.id.length > 0
    && session.user.tenantId.length > 0
    && Array.isArray(session.user.roles)
    && Array.isArray(session.user.permissions)
    && Number.isFinite(expiresAt)
    && now < expiresAt
}
