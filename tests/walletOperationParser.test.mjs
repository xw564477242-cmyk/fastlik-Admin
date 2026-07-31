import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseWalletOperationDetail,
  WalletOperationContractError,
} from '../src/walletOperationParser.ts'

const expected = {
  operationId: 'operation-1',
  tenantId: 'tenant-1',
  environment: 'TEST',
}

const validResponse = () => ({
  operation: {
    id: 'operation-1',
    tenantId: 'tenant-1',
    environment: 'TEST',
    type: 'INTERNAL_TRANSFER',
    status: 'COMPLETED',
    assetCode: 'USD',
    amount: '25.50',
    sourceAccountId: 'account-1',
    destinationAccountId: 'account-2',
    journalIds: ['journal-1'],
  },
  accounts: [
    { id: 'account-1', accountCode: 'CUSTOMER:1', assetCode: 'USD', postedBalance: '74.50', pendingBalance: '0' },
    { id: 'account-2', accountCode: 'CUSTOMER:2', assetCode: 'USD', postedBalance: '25.50', pendingBalance: '0' },
  ],
  journals: [{
    id: 'journal-1',
    status: 'POSTED',
    referenceType: 'WalletOperation',
    entries: [
      { side: 'DEBIT', assetCode: 'USD', amount: '25.50', walletAccountId: 'account-1' },
      { side: 'CREDIT', assetCode: 'USD', amount: '25.50', walletAccountId: 'account-2' },
    ],
  }],
  treasury: {
    assetCode: 'USD',
    sponsorReserve: '100',
    requiredReserve: '50',
    availableBalance: '75',
    authorizationHold: '0',
    pendingSettlement: '0',
  },
})

test('parses a bounded operation, account, journal and treasury summary', () => {
  const parsed = parseWalletOperationDetail(validResponse(), expected)

  assert.deepEqual(parsed.operation, {
    id: 'operation-1',
    type: 'INTERNAL_TRANSFER',
    status: 'COMPLETED',
    assetCode: 'USD',
    amount: '25.50',
    sourceAccountId: 'account-1',
    destinationAccountId: 'account-2',
    journalCount: 1,
  })
  assert.equal(parsed.accounts.length, 2)
  assert.deepEqual(parsed.journals, [{
    id: 'journal-1',
    status: 'POSTED',
    referenceType: 'WalletOperation',
    entryCount: 2,
    debitEntries: 1,
    creditEntries: 1,
    assetCodes: 'USD',
  }])
  assert.equal(parsed.treasury?.availableBalance, '75')
})

test('rejects identity, tenant and environment mismatches', () => {
  for (const [field, value] of [
    ['id', 'other-operation'],
    ['tenantId', 'other-tenant'],
    ['environment', 'PRODUCTION'],
  ]) {
    const response = validResponse()
    response.operation[field] = value
    assert.throws(
      () => parseWalletOperationDetail(response, expected),
      WalletOperationContractError,
    )
  }
})

test('rejects malformed operation status, asset and amount', () => {
  for (const [field, value] of [
    ['status', 'UNKNOWN'],
    ['assetCode', 'usd'],
    ['amount', 25.5],
  ]) {
    const response = validResponse()
    response.operation[field] = value
    assert.throws(
      () => parseWalletOperationDetail(response, expected),
      WalletOperationContractError,
    )
  }
})

test('rejects oversized accounts and inconsistent journal or treasury summaries', () => {
  const tooManyAccounts = validResponse()
  tooManyAccounts.accounts.push({ id: 'account-3', accountCode: 'CUSTOMER:3', assetCode: 'USD', postedBalance: '0', pendingBalance: '0' })
  assert.throws(() => parseWalletOperationDetail(tooManyAccounts, expected), /exceeds maximum 2/)

  const undeclaredJournal = validResponse()
  undeclaredJournal.journals[0].id = 'journal-other'
  assert.throws(() => parseWalletOperationDetail(undeclaredJournal, expected), /not declared/)

  const wrongTreasury = validResponse()
  wrongTreasury.treasury.assetCode = 'EUR'
  assert.throws(() => parseWalletOperationDetail(wrongTreasury, expected), /does not match operation asset/)
})
