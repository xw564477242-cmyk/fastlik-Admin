import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const index = read('index.html')
const runtime = read('src/runtimeConfig.ts')
const template = read('runtime-config.template.js')
const entrypoint = read('docker-entrypoint.sh')
const dockerfile = read('Dockerfile')

assert(index.includes('src="./runtime-config.js"'), 'runtime config must resolve from the deployment base')
assert(runtime.includes("window.__FASTLINK_RUNTIME__?.environment"), 'runtime environment override is required')
assert(runtime.includes("window.__FASTLINK_RUNTIME__?.apiUrl"), 'runtime API URL override is required')
assert(runtime.includes("window.__FASTLINK_RUNTIME__?.buildSha"), 'runtime Build SHA override is required')
assert(template.includes('$VITE_FASTLINK_ENVIRONMENT'), 'runtime template must expose the Dev environment')
assert(template.includes('$VITE_FASTLINK_API_URL'), 'runtime template must expose the Dev API URL')
assert(template.includes('$RAILWAY_GIT_COMMIT_SHA'), 'runtime template must expose the Railway Release SHA')
assert(entrypoint.includes('VITE_FASTLINK_ENVIRONMENT is required'), 'container startup must fail closed without environment')
assert(entrypoint.includes('VITE_FASTLINK_API_URL is required'), 'container startup must fail closed without API URL')
assert(entrypoint.includes('RAILWAY_GIT_COMMIT_SHA is required'), 'container startup must fail closed without Release SHA')
assert(entrypoint.includes('https://'), 'container startup must require an explicit HTTPS API URL')
assert(entrypoint.includes('LOCAL|SANDBOX|TEST|UAT|PRODUCTION'), 'container runtime must explicitly recognize TEST')
assert(entrypoint.includes('SANDBOX/TEST Admin must use the approved Backend Dev API'), 'SANDBOX and TEST containers must reject a non-Dev Backend')
assert(runtime.includes('Cloudflare Admin must use same-origin /api'), 'browser runtime must require the Cloudflare same-origin API')
assert(!entrypoint.includes('PRODUCTION_BACKEND') && !entrypoint.includes('mock'), 'Dev runtime must not contain a Production or Mock fallback')
assert(dockerfile.includes('/docker-entrypoint.d/40-fastlink-runtime.sh'), 'runtime generation must execute before nginx starts')

console.log('FastLink Admin Dev runtime contract PASS')
