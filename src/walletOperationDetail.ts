import {
  parseWalletOperationDetail,
  WalletOperationContractError,
  type WalletOperationDetail,
} from './walletOperationParser.ts'
import type { DataSource } from './adminRoutes'

export type WalletOperationDetailState =
  | { status: 'IDLE' | 'LOADING' }
  | { status: 'SUCCESS'; value: WalletOperationDetail }
  | { status: 'NOT_FOUND'; message: string }
  | { status: 'CONTRACT_ERROR'; message: string }
  | { status: 'ERROR'; message: string }

type ApiFailure = { status?: unknown; message?: unknown }

export const idleWalletOperationDetail = (): WalletOperationDetailState =>
  ({ status: 'IDLE' })

export const loadingWalletOperationDetail = (): WalletOperationDetailState =>
  ({ status: 'LOADING' })

export function loadedWalletOperationDetail(
  value: unknown,
  expected: { operationId: string; tenantId: string; environment: DataSource },
): WalletOperationDetailState {
  try {
    return { status: 'SUCCESS', value: parseWalletOperationDetail(value, expected) }
  } catch (error) {
    if (error instanceof WalletOperationContractError) {
      return { status: 'CONTRACT_ERROR', message: error.message }
    }
    throw error
  }
}

export const missingWalletOperationDetail = () => ({
  busy: false as const,
  sections: [] as const,
  pageError: '' as const,
  detail: {
    status: 'ERROR' as const,
    message: '请输入真实 Wallet Operation ID',
  },
})

export function failedWalletOperationDetail(error: unknown): WalletOperationDetailState {
  const failure = error && typeof error === 'object' ? error as ApiFailure : {}
  const message = typeof failure.message === 'string' ? failure.message : 'Wallet operation request failed'
  return failure.status === 404
    ? { status: 'NOT_FOUND', message }
    : { status: 'ERROR', message }
}
