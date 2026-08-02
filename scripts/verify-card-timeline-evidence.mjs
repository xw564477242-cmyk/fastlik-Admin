import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { adminCardTimelineContractEvidence } from '../src/cardTimelineContract.ts'

const sourceCommit = process.env.SOURCE_SHA ?? ''
const actual = JSON.parse(readFileSync('card-timeline-contract-evidence.json', 'utf8'))
assert.deepEqual(actual, adminCardTimelineContractEvidence(sourceCommit))
assert.equal(actual.format, 'fastlink-admin-card-timeline-contract-v1')
assert.deepEqual(actual.runtimeEnvironments, ['SANDBOX', 'TEST'])
assert.equal(actual.productionEnabled, false)
assert.equal(actual.method, 'GET')
assert.equal(actual.authentication, 'ADMIN_BEARER_MEMORY_ONLY')
assert.equal(actual.credentialsMode, 'omit')
assert.equal(actual.csrfRequired, false)
assert.equal(actual.atomicRefresh, true)
assert.deepEqual(actual.clearSnapshotOnCurrentStatus, [401, 403, 404])
assert.deepEqual(actual.matchingSessionInvalidationOnCurrentStatus, [401])
assert.ok(actual.collectionScopeBindings.includes('tokenIdentityMarker'))
assert.deepEqual(actual.sessionScopeBindings, ['actorId', 'sessionExpiresAt', 'tokenIdentityMarker', 'sessionTenantId', 'selectedTenantId', 'runtimeEnvironment', 'roles', 'permissions'])
assert.equal(actual.sameTenantRequired, true)
assert.equal(actual.requiredPermission, 'admin:read')
assert.equal(actual.staleCompletionWrites, 0)
assert.equal(actual.providerCalls, 0)
assert.equal(actual.businessWrites, 0)
console.log(`Card timeline contract evidence verified for ${sourceCommit}`)
