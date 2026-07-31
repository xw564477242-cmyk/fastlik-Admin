import assert from 'node:assert/strict'
import test from 'node:test'
import {
  failedWalletOperationDetail,
  idleWalletOperationDetail,
  loadedWalletOperationDetail,
  loadingWalletOperationDetail,
} from '../src/walletOperationDetail.ts'

test('wallet operation detail exposes idle, loading and success states', () => {
  assert.deepEqual(idleWalletOperationDetail(), { status: 'IDLE' })
  assert.deepEqual(loadingWalletOperationDetail(), { status: 'LOADING' })
  const response = {
    operation: {
      id: 'operation-1',
      tenantId: 'tenant-1',
      environment: 'TEST',
      type: 'DEPOSIT',
      status: 'COMPLETED',
      assetCode: 'USD',
      amount: '10.00',
      sourceAccountId: null,
      destinationAccountId: 'account-1',
      journalIds: [],
    },
    accounts: [
      { id: 'account-1', accountCode: 'CUSTOMER:1', assetCode: 'USD', postedBalance: '10.00', pendingBalance: '0' },
    ],
    journals: [],
    treasury: null,
  }
  const loaded = loadedWalletOperationDetail(response, {
    operationId: 'operation-1',
    tenantId: 'tenant-1',
    environment: 'TEST',
  })
  assert.equal(loaded.status, 'SUCCESS')
})

test('wallet operation detail exposes Backend contract failures', () => {
  assert.deepEqual(
    loadedWalletOperationDetail({}, {
      operationId: 'operation-1',
      tenantId: 'tenant-1',
      environment: 'TEST',
    }),
    {
      status: 'CONTRACT_ERROR',
      message: 'operation: expected object',
    },
  )
})

test('wallet operation detail renders a dedicated 404 state', () => {
  assert.deepEqual(
    failedWalletOperationDetail({ status: 404, message: 'Wallet operation not found' }),
    { status: 'NOT_FOUND', message: 'Wallet operation not found' },
  )
})

test('wallet operation detail keeps non-404 failures distinct', () => {
  assert.deepEqual(
    failedWalletOperationDetail({ status: 503, message: 'Backend unavailable' }),
    { status: 'ERROR', message: 'Backend unavailable' },
  )
  assert.deepEqual(
    failedWalletOperationDetail(null),
    { status: 'ERROR', message: 'Wallet operation request failed' },
  )
})
