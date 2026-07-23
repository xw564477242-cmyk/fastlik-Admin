export type FastLinkEnvironment = 'LOCAL' | 'SANDBOX' | 'UAT' | 'PRODUCTION'

function required(name: string): string {
  const value = import.meta.env[name]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing required build variable: ${name}`)
  return value.trim()
}

const environment = required('VITE_FASTLINK_ENVIRONMENT') as FastLinkEnvironment
if (!['LOCAL', 'SANDBOX', 'UAT', 'PRODUCTION'].includes(environment)) {
  throw new Error('VITE_FASTLINK_ENVIRONMENT must be LOCAL, SANDBOX, UAT, or PRODUCTION')
}

const apiUrl = required('VITE_FASTLINK_API_URL').replace(/\/$/, '')
if (!/^https?:\/\//.test(apiUrl)) throw new Error('VITE_FASTLINK_API_URL must be an absolute HTTP(S) URL')
if (environment === 'PRODUCTION' && !apiUrl.startsWith('https://')) throw new Error('Production API URL must use HTTPS')

export const runtimeConfig = Object.freeze({
  environment,
  apiUrl,
  buildSha: (import.meta.env.VITE_FASTLINK_BUILD_SHA as string | undefined)?.trim() || 'unknown',
})
