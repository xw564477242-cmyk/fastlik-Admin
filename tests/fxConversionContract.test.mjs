import assert from 'node:assert/strict'
import test from 'node:test'
import { adminRoutes } from '../src/adminRoutes.ts'
import {
  FxConversionContractError,
  fxConversionScope,
  fxConversionSessionReadAllowed,
  parseFxConversionResponse,
} from '../src/fxConversionContract.ts'

const conversion = (patch = {}) => ({
  id: 'conversion-1',
  cardId: 'card-1',
  cardType: 'VIRTUAL',
  environment: 'SANDBOX',
  quoteId: 'quote-1',
  sourceWalletAccountId: 'account-usdt',
  destinationWalletAccountId: 'account-usd',
  sourceAssetCode: 'USDT',
  targetAssetCode: 'USD',
  sourceAmount: '100',
  targetAmount: '99',
  rate: '0.99',
  status: 'COMPLETED',
  createdAt: '2026-08-11T00:00:00.000Z',
  completedAt: '2026-08-11T00:00:01.000Z',
  ...patch,
})
const expected = { conversionId: 'conversion-1', environment: 'SANDBOX' }

test('builds the exact tenant-scoped SANDBOX/TEST FX conversion GET route', () => {
  assert.equal(adminRoutes.walletFxConversion('tenant/1', 'conversion:1', 'TEST'), '/admin/tenants/tenant%2F1/wallet/fx/conversions/conversion%3A1?environment=TEST')
  assert.throws(() => adminRoutes.walletFxConversion('tenant', '../conversion', 'SANDBOX'), /conversion is invalid/)
  assert.throws(() => adminRoutes.walletFxConversion('tenant', 'conversion-1', 'PRODUCTION'), /environment is invalid/)
})

test('accepts only the exact frozen FxConversionResponseDto and exposes all declared fields', () => {
  const parsed = parseFxConversionResponse(JSON.stringify(conversion()), expected)
  assert.deepEqual(parsed, conversion())
  assert.equal(Object.isFrozen(parsed), true)
})

test('fails closed on scope, unknown fields, enums, decimals, timestamps and wire bounds', () => {
  const invalid = [
    conversion({ id: 'conversion-2' }),
    conversion({ environment: 'TEST' }),
    { ...conversion(), providerSecret: 'blocked' },
    conversion({ cardType: 'PLASTIC' }),
    conversion({ sourceAmount: '0' }),
    conversion({ rate: '1.0' }),
    conversion({ completedAt: '2026-08-10T23:59:59.000Z' }),
  ]
  invalid.forEach((value) => assert.throws(() => parseFxConversionResponse(JSON.stringify(value), expected), FxConversionContractError))
  assert.throws(() => parseFxConversionResponse('['.repeat(9) + ']'.repeat(9), expected), FxConversionContractError)
  assert.throws(() => parseFxConversionResponse(' '.repeat(32_769), expected), FxConversionContractError)
})

test('session and request scope bind actor, tenants, environment, RBAC, expiry and conversion', () => {
  const session = {
    accessToken: 'memory-token', tokenType: 'Bearer', expiresInSeconds: 3600, expiresAt: '2026-08-11T01:00:00.000Z',
    user: { id: 'admin-1', email: 'admin@example.test', tenantId: 'tenant-home', environment: 'SANDBOX', roles: ['ADMIN'], permissions: ['wallet:read'] },
  }
  assert.equal(fxConversionSessionReadAllowed(session, 'SANDBOX', Date.parse('2026-08-11T00:00:00.000Z')), true)
  assert.equal(fxConversionSessionReadAllowed(session, 'PRODUCTION', Date.parse('2026-08-11T00:00:00.000Z')), false)
  assert.equal(fxConversionSessionReadAllowed(session, 'SANDBOX', Date.parse(session.expiresAt)), false)
  assert.notEqual(fxConversionScope(session, 'tenant-a', 'SANDBOX', 'conversion-1'), fxConversionScope(session, 'tenant-a', 'SANDBOX', 'conversion-2'))
})
