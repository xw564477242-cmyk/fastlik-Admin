import {
  MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES,
  type AdminWalletTransactionTransport,
} from './adminWalletTransactionContract'
import { apiRequest } from './productionApi'

export const adminWalletTransactionHttpTransport: AdminWalletTransactionTransport = ({ path, token, signal }) =>
  apiRequest<string>(
    path,
    token,
    'GET',
    undefined,
    { format: 'bounded-text', maxBytes: MAX_ADMIN_WALLET_TRANSACTION_JSON_BYTES },
    signal,
  )
