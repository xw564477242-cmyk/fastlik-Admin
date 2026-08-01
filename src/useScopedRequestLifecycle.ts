import { useEffect, useRef, type MutableRefObject } from 'react'
import {
  abortCurrentRequest,
  createRequestGate,
  invalidateRequests,
  transitionRequestBaseScope,
  type RequestAbortSlot,
  type RequestGate,
} from './requestGeneration.ts'

export type ScopedRequestLifecycle = Readonly<{
  mounted: MutableRefObject<boolean>
  requestAbort: RequestAbortSlot
  requestGate: MutableRefObject<RequestGate>
}>

export function useScopedRequestLifecycle(baseScope: string): ScopedRequestLifecycle {
  const mounted = useRef(false)
  const requestAbort = useRef<AbortController | null>(null)
  const requestGate = useRef(createRequestGate(baseScope))

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abortCurrentRequest(requestAbort)
      invalidateRequests(requestGate.current)
    }
  }, [])

  useEffect(() => {
    transitionRequestBaseScope(requestGate.current, requestAbort, baseScope)
  }, [baseScope])

  return { mounted, requestAbort, requestGate }
}
