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
  const value = { id: 'operation-1', status: 'COMPLETED' }
  assert.deepEqual(loadedWalletOperationDetail(value), { status: 'SUCCESS', value })
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
