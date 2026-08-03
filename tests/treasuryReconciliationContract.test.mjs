import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'
import {
  parseTreasuryDailyClosing,
  parseTreasuryLiquidity,
  parseTreasuryReconciliation,
  parseTreasuryTrialBalance,
  treasuryDashboardScope,
  treasurySessionReadAllowed,
} from '../src/treasuryReconciliationContract.ts'

const pendingChecks = [{
  assetCode: 'USD',
  positionMissing: false,
  expectedPendingSettlement: '10',
  treasuryPendingSettlement: '10',
  difference: '0',
  matched: true,
}]
const authorizationHoldChecks = [{
  assetCode: 'USD',
  positionMissing: false,
  expectedAuthorizationHold: '5',
  treasuryAuthorizationHold: '5',
  difference: '0',
  matched: true,
}]
const clearingDifferenceChecks = [{ assetCode: 'USD', clearingDifference: '-5', expectedAuthorizationHold: '5', matched: true }]
const journalChecks = [{ assetCode: 'USD', debit: '100', credit: '100', matched: true }]
const trialBalance = [{ assetCode: 'USD', debit: '100', credit: '100', balanced: true }]
const liquidity = (positions = [{
  assetCode: 'USD',
  availableBalance: '1000.25',
  authorizationHold: '20',
  sponsorReserve: '80',
  requiredReserve: '100',
  pendingSettlement: '10.5',
  liquidityRatio: '80',
  reserveBreached: true,
}]) => ({ generatedAt: '2026-08-01T00:00:00.000Z', positions })

const reconciliation = (patch = {}) => ({
  generatedAt: '2026-08-01T00:00:00.000Z',
  dataSource: 'TEST',
  status: 'MATCHED',
  evidencePresent: true,
  pendingChecks,
  authorizationHoldChecks,
  clearingDifferenceChecks,
  journalChecks,
  trialBalance,
  externalReconciliation: {
    bank: { status: 'BLOCKED', blocker: 'No bank statement or bank-confirmed settlement evidence is stored' },
    processor: { status: 'BLOCKED', blocker: 'No official processor reconciliation file or API evidence is stored' },
  },
  ...patch,
})

const dailyClosing = (patch = {}) => ({
  reportType: 'FINANCIAL_OPERATIONAL_REPORT',
  generatedAt: '2026-08-01T00:01:00.000Z',
  businessDate: '2026-08-01',
  dataSource: 'TEST',
  status: 'BLOCKED',
  internalFinancialStatus: 'PASS',
  externalReconciliationStatus: 'BLOCKED',
  activity: { walletOperations: 1, merchantPayments: 2, cardTransactions: 3, journals: 4, auditEvents: 5 },
  trialBalance,
  treasuryReconciliation: { pendingChecks, authorizationHoldChecks, clearingDifferenceChecks },
  settlementReconciliation: journalChecks,
  externalChecks: [
    { operation: 'bank-reconciliation', evidence: null },
    { operation: 'processor-reconciliation', evidence: null },
    { operation: 'settlement-reconciliation', evidence: null },
  ],
  blockers: [
    'Missing PASS evidence: bank-reconciliation',
    'Missing PASS evidence: processor-reconciliation',
    'Missing PASS evidence: settlement-reconciliation',
  ],
  ...patch,
})

test('Treasury routes are immutable SANDBOX/TEST GET targets with encoded tenant scope', () => {
  const tenant = 'tenant/acme?environment=PRODUCTION'
  assert.equal(adminRoutes.treasuryLiquidity(tenant, 'SANDBOX'), '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/settlement/liquidity?environment=SANDBOX')
  assert.equal(adminRoutes.treasuryReconciliation(tenant, 'TEST'), '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/settlement/reconciliation?environment=TEST')
  assert.equal(adminRoutes.treasuryTrialBalance(tenant, 'SANDBOX'), '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/settlement/trial-balance?environment=SANDBOX')
  assert.equal(adminRoutes.treasuryDailyClosing(tenant, 'TEST'), '/admin/tenants/tenant%2Facme%3Fenvironment%3DPRODUCTION/settlement/daily-closing?environment=TEST')
})

test('Liquidity parser exposes only the exact bounded per-asset Backend contract', () => {
  const exact = liquidity([{ ...liquidity().positions[0], assetCode: 'US' }])
  const snapshot = parseTreasuryLiquidity(JSON.stringify(exact))
  assert.deepEqual(snapshot, exact)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.positions), true)
  assert.equal(Object.isFrozen(snapshot.positions[0]), true)
  assert.equal('tenantId' in snapshot.positions[0], false)
  assert.equal('providerAccountRef' in snapshot.positions[0], false)
})

test('Liquidity parser rejects internal fields, unsafe ordering, overflow and inconsistent reserve states', () => {
  const row = liquidity().positions[0]
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity([{ ...row, providerAccountRef: 'secret' }]))), /could not be verified/)
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity([row, row]))), /could not be verified/)
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity([
    { ...row, assetCode: 'USD' },
    { ...row, assetCode: 'EUR' },
  ]))), /could not be verified/)
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity(Array.from({ length: 51 }, (_, index) => ({
    ...row,
    assetCode: `A${String(index).padStart(2, '0')}`,
  }))))), /exceeds the local safety limit/)
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity([{ ...row, reserveBreached: false }]))), /could not be verified/)
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity([{ ...row, requiredReserve: '0', liquidityRatio: '0', reserveBreached: false }]))), /could not be verified/)
  assert.throws(() => parseTreasuryLiquidity(JSON.stringify(liquidity([{ ...row, assetCode: 'U' }]))), /could not be verified/)
})

test('Reconciliation parser returns only safe summary fields and counts verified exceptions', () => {
  const summary = parseTreasuryReconciliation(JSON.stringify(reconciliation()), 'TEST')
  assert.deepEqual(summary, {
    generatedAt: '2026-08-01T00:00:00.000Z',
    status: 'MATCHED',
    evidencePresent: true,
    imbalanceCount: 0,
    exceptionCount: 2,
    assetCount: 1,
  })
  assert.equal('externalReconciliation' in summary, false)
  assert.equal(JSON.stringify(summary).includes('bank'), false)
  assert.equal(JSON.stringify(summary).includes('processor'), false)
})

test('Trial balance parser accepts exact public rows and rejects duplicates or unknown fields', () => {
  assert.deepEqual(parseTreasuryTrialBalance(JSON.stringify(trialBalance)), trialBalance)
  assert.throws(() => parseTreasuryTrialBalance(JSON.stringify([...trialBalance, ...trialBalance])), /could not be verified/)
  assert.throws(() => parseTreasuryTrialBalance(JSON.stringify([{ ...trialBalance[0], internalAccountId: 'secret' }])), /could not be verified/)
})

test('Daily closing parser redacts raw evidence names into safe blocker categories', () => {
  const summary = parseTreasuryDailyClosing(JSON.stringify(dailyClosing()), 'TEST')
  assert.deepEqual(summary.closingBlockers, ['EXTERNAL_EVIDENCE'])
  assert.equal(summary.blockerCount, 3)
  assert.equal(JSON.stringify(summary).includes('bank-reconciliation'), false)
  assert.equal(JSON.stringify(summary).includes('processor-reconciliation'), false)
  assert.deepEqual(summary.activity, { walletOperations: 1, merchantPayments: 2, cardTransactions: 3, journals: 4, auditEvents: 5 })
})

test('Treasury contracts fail closed on unknown fields, environment mismatch and inconsistent status', () => {
  assert.throws(() => parseTreasuryReconciliation(JSON.stringify({ ...reconciliation(), providerPayload: {} }), 'TEST'), /could not be verified/)
  assert.throws(() => parseTreasuryReconciliation(JSON.stringify(reconciliation()), 'SANDBOX'), /selected environment/)
  assert.throws(() => parseTreasuryReconciliation(JSON.stringify(reconciliation({ status: 'NO_DATA' })), 'TEST'), /could not be verified/)
  assert.throws(() => parseTreasuryDailyClosing(JSON.stringify(dailyClosing({ internalDebug: true })), 'TEST'), /could not be verified/)
  assert.throws(() => parseTreasuryDailyClosing(JSON.stringify(dailyClosing({ blockers: ['raw provider secret'] })), 'TEST'), /could not be verified/)
  assert.throws(() => parseTreasuryDailyClosing(JSON.stringify(dailyClosing({ status: 'PASS' })), 'TEST'), /could not be verified/)
})

test('Treasury scope binds actor, session expiry, home tenant, selected tenant, environment and RBAC', () => {
  const session = {
    accessToken: 'token',
    expiresAt: '2026-08-01T01:00:00.000Z',
    user: { id: 'admin-1', tenantId: 'home-tenant', environment: 'TEST', roles: ['OPS', 'ADMIN'], permissions: ['admin:read', 'platform:tenants:write'] },
  }
  const scope = treasuryDashboardScope(session, 'selected-tenant', 'TEST')
  assert.match(scope, /admin-1/)
  assert.match(scope, /home-tenant/)
  assert.match(scope, /selected-tenant/)
  assert.match(scope, /admin:read/)
  assert.equal(treasurySessionReadAllowed(session, 'selected-tenant', 'TEST', Date.parse('2026-08-01T00:59:59.999Z')), true)
  assert.equal(treasurySessionReadAllowed(session, 'selected-tenant', 'TEST', Date.parse(session.expiresAt)), false)
  assert.equal(treasurySessionReadAllowed(session, 'selected-tenant', 'SANDBOX', Date.parse('2026-08-01T00:00:00.000Z')), false)
  assert.equal(treasurySessionReadAllowed({ ...session, user: { ...session.user, environment: 'PRODUCTION' } }, 'selected-tenant', 'PRODUCTION', 0), false)
  assert.equal(treasurySessionReadAllowed({ ...session, user: { ...session.user, permissions: ['admin:read'] } }, 'selected-tenant', 'TEST', Date.parse('2026-08-01T00:00:00.000Z')), false)
  assert.equal(treasurySessionReadAllowed({ ...session, user: { ...session.user, permissions: ['platform:tenants:write'] } }, 'selected-tenant', 'TEST', Date.parse('2026-08-01T00:00:00.000Z')), false)
})
