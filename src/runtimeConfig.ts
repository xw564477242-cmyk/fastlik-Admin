export type FastLinkEnvironment = 'LOCAL' | 'SANDBOX' | 'TEST' | 'UAT' | 'PRODUCTION'

function required(name: string): string {
  const value = import.meta.env[name]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing required build variable: ${name}`)
  return value.trim()
}

const buildEnvironment = required('VITE_FASTLINK_ENVIRONMENT')
const environment = (window.__FASTLINK_RUNTIME__?.environment?.trim() || buildEnvironment) as FastLinkEnvironment
if (!['LOCAL', 'SANDBOX', 'TEST', 'UAT', 'PRODUCTION'].includes(environment)) {
  throw new Error('VITE_FASTLINK_ENVIRONMENT must be LOCAL, SANDBOX, TEST, UAT, or PRODUCTION')
}

const buildApiUrl = required('VITE_FASTLINK_API_URL')
const apiUrl = (window.__FASTLINK_RUNTIME__?.apiUrl?.trim() || buildApiUrl).replace(/\/$/, '')
if (apiUrl !== '/api' && !/^https:\/\//.test(apiUrl)) {
  throw new Error('VITE_FASTLINK_API_URL must be same-origin /api or an absolute HTTPS URL')
}
if (['SANDBOX', 'TEST', 'PRODUCTION'].includes(environment) && apiUrl !== '/api') {
  throw new Error(`${environment} Cloudflare Admin must use same-origin /api`)
}

const runtimeBuildSha = window.__FASTLINK_RUNTIME__?.buildSha?.trim()
const verifiedRuntimeBuildSha = runtimeBuildSha && /^[0-9a-f]{40}$/i.test(runtimeBuildSha)
  ? runtimeBuildSha
  : undefined

export const runtimeConfig = Object.freeze({
  environment,
  apiUrl,
  buildSha: verifiedRuntimeBuildSha
    || (import.meta.env.VITE_FASTLINK_BUILD_SHA as string | undefined)?.trim()
    || 'unknown',
})
