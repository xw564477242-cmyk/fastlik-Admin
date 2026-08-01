import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { adminCardTransactionContractEvidence } from '../src/cardTransactionContract.ts'

const sourceCommit = process.env.SOURCE_SHA ?? ''
const actual = JSON.parse(readFileSync('card-transaction-contract-evidence.json', 'utf8'))
assert.deepEqual(actual, adminCardTransactionContractEvidence(sourceCommit))
assert.equal(actual.format, 'fastlink-admin-card-transaction-contract-v2')
assert.deepEqual(actual.runtimeEnvironments, ['SANDBOX', 'TEST'])
assert.equal(actual.productionEnabled, false)
assert.deepEqual(actual.readOnlyMethods, ['GET'])
assert.equal(actual.transactionFields.length, 13)
assert.equal(actual.allStatusEncoding, 'OMITTED')
assert.equal(actual.exactFieldsRequired, true)
assert.equal(actual.activeCancellationRequired, true)
assert.equal(actual.selectionClearedOnFilterChange, true)
assert.deepEqual(actual.mountedRequestLifecycle, {
  busyRenderPreservesActiveScope: true,
  baseScopeChangesEffectOnly: true,
  lateCompletionWrites: 0,
})
assert.deepEqual(actual.mountedAdversarialInvalidations, [
  'cardId',
  'filter',
  'listSnapshot',
  'actorId',
  'tenantId',
  'environment',
  'unmount',
  'repeat',
])
console.log(`Card transaction contract evidence verified for ${sourceCommit}`)
