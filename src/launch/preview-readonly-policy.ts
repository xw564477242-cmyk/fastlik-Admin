import { serverRequestAllowed } from './b10-policy'

export function previewRequestAllowed(target: string, method = 'GET'): boolean {
  if (!serverRequestAllowed(target, method)) return false
  if (method === 'GET') return true
  return method === 'POST' && /^\/api\/(?:v1\/auth\/(?:login|logout|refresh)|admin\/auth\/(?:login|logout))$/.test(target)
}

export function previewBrowserRequestAllowed(target: string, method = 'GET'): boolean {
  return previewRequestAllowed(target.startsWith('/api/') ? target : '/api' + target, method)
}
