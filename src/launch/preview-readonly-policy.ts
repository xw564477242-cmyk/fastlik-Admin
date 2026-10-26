import { serverRequestAllowed } from './b10-policy'
import { restoredAdminReadAllowed } from './admin-restored-read-routing'

export function previewRequestAllowed(target: string, method = 'GET'): boolean {
  if (!serverRequestAllowed(target, method)) return false
  if (method === 'GET') return /^\/api\/(?:admin\/auth\/me|health(?:\/readiness)?)$/.test(target) || restoredAdminReadAllowed(target.slice(4), method)
  return method === 'POST' && /^\/api\/admin\/auth\/(?:login|logout)$/.test(target)
}

export function previewBrowserRequestAllowed(target: string, method = 'GET'): boolean {
  return previewRequestAllowed(target.startsWith('/api/') ? target : '/api' + target, method)
}
