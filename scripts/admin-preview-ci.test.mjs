import assert from 'node:assert/strict'
import test from 'node:test'
import { release, target, Stop } from './admin-preview-ci.mjs'

const secret = 'offline-ci-fixture-not-a-real-credential'
const env = () => ({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: target.repository,
  GITHUB_REF: target.ref, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: 'a'.repeat(40), HOSTED_ACCOUNT_ID: target.account, CLOUDFLARE_API_TOKEN: secret })
const next = '11111111-2222-4333-8444-555555555555'
const response = version => ({ ok: true, status: 200, json: async () => ({ success: true,
  result: { deployments: [{ versions: [{ version_id: version, percentage: 100 }], created_on: '2026-10-25T10:00:00Z' }] } }) })
const verifyPayload = async () => 9

test('wrong ref, event, retry or repository never uses a credential or publishes', async () => {
  for (const patch of [{ GITHUB_REF: 'refs/heads/dev' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REPOSITORY: 'other/repository' }]) {
    let calls = 0
    await assert.rejects(release({ ...env(), ...patch }, { verifyPayload,
      fetchImpl: async () => { calls++ }, publish: async () => { calls++ } }),
    error => error.code === 'REF_OR_CONTEXT_REFUSED')
    assert.equal(calls, 0)
  }
})
test('account mismatch stops before any external request, without exposing its value', async () => {
  let calls = 0
  await assert.rejects(release({ ...env(), HOSTED_ACCOUNT_ID: 'other-account' }, { verifyPayload,
    fetchImpl: async () => { calls++ } }), error => {
    assert(!JSON.stringify(error).includes('other-account'))
    assert(!JSON.stringify(error).includes(secret))
    return error.code === 'HOSTED_ACCOUNT_MISMATCH'
  })
  assert.equal(calls, 0)
})
test('fixed Worker refusal stops after one request and does not publish or try another target', async () => {
  const urls = []; let published = false
  await assert.rejects(release(env(), { verifyPayload, fetchImpl: async url => {
    urls.push(url); return { ok: false, status: 403 }
  }, publish: async () => { published = true } }), error => error.code === 'FIXED_TARGET_ACCESS_REFUSED')
  assert.equal(urls.length, 1)
  assert(urls[0].endsWith(`/accounts/${target.account}/workers/scripts/${target.worker}/deployments`))
  assert.equal(published, false)
})
test('unexpected active version is not overwritten', async () => {
  let published = false
  await assert.rejects(release(env(), { verifyPayload, fetchImpl: async () => response(next),
    publish: async () => { published = true } }), error => error.code === 'EXISTING_VERSION_DRIFT')
  assert.equal(published, false)
})
test('one matching release is followed by metadata readback; public receipt has no credentials', async () => {
  let requests = 0; let publishes = 0
  const result = await release(env(), { verifyPayload,
    fetchImpl: async () => response(requests++ === 0 ? target.previousVersion : next),
    publish: async () => { publishes++; return next } })
  assert.equal(requests, 2); assert.equal(publishes, 1)
  assert.equal(result.status, 'PUBLISHED_METADATA_CONFIRMED')
  assert.equal(result.newVersion, next)
  assert.equal(result.browserLoginAndData, 'NOT_VERIFIED_BY_CI')
  assert(!JSON.stringify(result).includes(secret))
})
test('publish failure is retained as unknown and never automatically retried', async () => {
  let publishes = 0
  await assert.rejects(release(env(), { verifyPayload, fetchImpl: async () => response(target.previousVersion),
    publish: async () => { publishes++; throw new Stop('WRANGLER_FAILED_PUBLISH_UNCONFIRMED') } }),
  error => error.code === 'WRANGLER_FAILED_PUBLISH_UNCONFIRMED' && error.publishMayHaveStarted)
  assert.equal(publishes, 1)
})
