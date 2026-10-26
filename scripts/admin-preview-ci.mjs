import { readFile, writeFile, appendFile, lstat, mkdtemp, symlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { stripVTControlCharacters } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const target = Object.freeze({
  repository: 'xw564477242-cmyk/fastlik-Admin',
  ref: 'refs/heads/codex/fl-launch-b17-admin-preview-ci-20261025',
  account: 'af8ac20dee08abe5ec98a892ae83873e',
  worker: 'fastlink-admin-preview-b13',
  previousVersion: 'd7aad90e-8185-40be-9f31-461f154ea6d4',
})
const packageRoot = path.resolve('ci/admin-preview-b17')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class Stop extends Error {
  constructor(code, httpStatus) { super(code); this.code = code; this.httpStatus = httpStatus }
}
export function guard(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== target.repository ||
      env.GITHUB_REF !== target.ref || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_RUN_ATTEMPT !== '1' || !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '')) throw new Stop('REF_OR_CONTEXT_REFUSED')
  if (!env.CLOUDFLARE_API_TOKEN || !env.HOSTED_ACCOUNT_ID) throw new Stop('HOSTED_CREDENTIAL_UNAVAILABLE')
  if (env.HOSTED_ACCOUNT_ID.trim() !== target.account) throw new Stop('HOSTED_ACCOUNT_MISMATCH')
}
export async function verifyPayload() {
  const config = JSON.parse(await readFile(path.join(packageRoot, 'wrangler.json'), 'utf8'))
  if (config.account_id !== target.account || config.name !== target.worker ||
      config.main !== './frontend/worker.js' || config.assets?.directory !== './frontend/public' ||
      Object.hasOwn(config, 'vars')) throw new Stop('PACKAGE_TARGET_REFUSED')
  const lines = (await readFile(path.join(packageRoot, 'APPROVED-SHA256SUMS'), 'utf8')).trim().split('\n')
  if (lines.length !== 12) throw new Stop('APPROVED_PACKAGE_SCOPE_REFUSED')
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (wrangler\.json|frontend\/[A-Za-z0-9_./-]+)$/.exec(line)
    if (!match || match[2].includes('..')) throw new Stop('PACKAGE_PATH_REFUSED')
    const file = path.join(packageRoot, match[2])
    if (!(await lstat(file)).isFile()) throw new Stop('PACKAGE_FILE_REFUSED')
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== match[1]) throw new Stop('PACKAGE_SHA_MISMATCH')
  }
  return lines.length
}
async function metadata(env, fetchImpl) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${target.account}/workers/scripts/${target.worker}/deployments`
  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, Accept: 'application/json' },
    })
  } catch { throw new Stop('FIXED_TARGET_REQUEST_FAILED') }
  if (!response.ok) throw new Stop('FIXED_TARGET_ACCESS_REFUSED', response.status)
  let value
  try { value = await response.json() } catch { throw new Stop('FIXED_TARGET_METADATA_INVALID') }
  const latest = value?.result?.deployments?.[0]
  const versions = latest?.versions
  if (value.success !== true || !latest || !Array.isArray(versions) || versions.length !== 1 ||
      versions[0].percentage !== 100 || !uuid.test(versions[0].version_id || '') ||
      !Number.isFinite(Date.parse(latest.created_on))) throw new Stop('FIXED_TARGET_DEPLOYMENT_AMBIGUOUS')
  return { version: versions[0].version_id, createdOn: latest.created_on }
}
export async function publish(env) {
  if (!env.WRANGLER_BIN || !path.isAbsolute(env.WRANGLER_BIN)) throw new Stop('PINNED_TOOL_UNAVAILABLE')
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP)) throw new Stop('RUNNER_TEMP_UNAVAILABLE')
  const logDir = await mkdtemp(path.join(env.RUNNER_TEMP, 'fl-b17-log-'))
  const logSink = path.join(logDir, 'null.log')
  await symlink('/dev/null', logSink)
  const childEnv = { ...env, CLOUDFLARE_ACCOUNT_ID: target.account, CI: 'true',
    WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: logSink,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
  delete childEnv.HOSTED_ACCOUNT_ID
  delete childEnv.CLOUDFLARE_API_KEY
  delete childEnv.CLOUDFLARE_EMAIL
  return new Promise((resolve, reject) => {
    const child = spawn(env.WRANGLER_BIN, ['deploy', '--config', 'wrangler.json', '--keep-vars',
      '--autoconfig=false', '--message', `FL-LAUNCH-B17 readonly Admin ${env.GITHUB_SHA}`],
    { cwd: packageRoot, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let stdout = ''
    child.stdout.on('data', data => { if (stdout.length < 1048576) stdout += data.toString() })
    child.stderr.on('data', () => {})
    child.on('error', () => reject(new Stop('WRANGLER_START_FAILED')))
    child.on('close', code => {
      if (code !== 0) { reject(new Stop('WRANGLER_FAILED_PUBLISH_UNCONFIRMED')); return }
      const match = /Current Version ID:\s*([0-9a-f-]{36})/i.exec(stripVTControlCharacters(stdout))
      if (!match || !uuid.test(match[1])) { reject(new Stop('WRANGLER_VERSION_UNCONFIRMED')); return }
      resolve(match[1])
    })
  })
}
export async function release(env, deps = {}) {
  let phase = 'CONTEXT'
  try {
    guard(env)
    phase = 'PAYLOAD'
    const files = await (deps.verifyPayload || verifyPayload)()
    phase = 'FIXED_TARGET_BINDING'
    const before = await metadata(env, deps.fetchImpl || fetch)
    if (before.version !== target.previousVersion) throw new Stop('EXISTING_VERSION_DRIFT')
    phase = 'PUBLISH'
    const version = await (deps.publish || publish)(env)
    phase = 'PUBLISH_READBACK'
    const after = await metadata(env, deps.fetchImpl || fetch)
    if (version === before.version || after.version !== version) throw new Stop('PUBLISHED_VERSION_MISMATCH')
    return { status: 'PUBLISHED_METADATA_CONFIRMED', account: target.account, worker: target.worker,
      previousVersion: before.version, newVersion: after.version, publishedAt: after.createdOn,
      sourceHead: env.GITHUB_SHA, approvedPayloadFiles: files, varsSecretsLeaseChanged: false,
      browserLoginAndData: 'NOT_VERIFIED_BY_CI', backendOperations: 0 }
  } catch (error) {
    const safe = error instanceof Stop ? error : new Stop('UNEXPECTED_SAFE_STOP')
    safe.phase = phase
    safe.publishMayHaveStarted = phase === 'PUBLISH' || phase === 'PUBLISH_READBACK'
    throw safe
  }
}
async function main() {
  let result
  try { result = await release(process.env) }
  catch (error) {
    result = { status: 'STOP', account: target.account, worker: target.worker,
      reason: error instanceof Stop ? error.code : 'UNEXPECTED_SAFE_STOP',
      phase: error.phase || 'CONTEXT', httpStatus: error.httpStatus,
      publishMayHaveStarted: error.publishMayHaveStarted === true, automaticRetry: false }
    process.exitCode = 1
  }
  const safe = JSON.stringify(result, null, 2)
  console.log(safe)
  if (process.env.PREVIEW_RESULT_FILE) await writeFile(process.env.PREVIEW_RESULT_FILE, safe + '\n', { mode: 0o600 })
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '```json\n' + safe + '\n```\n')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('SAFE_RECEIPT_WRITE_FAILED'); process.exitCode = 1 })
}
