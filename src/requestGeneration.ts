export type RequestGate = {
  generation: number
  scope: string
}

export type RequestTicket = Readonly<{
  generation: number
  scope: string
}>

export const createRequestGate = (scope: string): RequestGate =>
  ({ generation: 0, scope })

export function syncRequestScope(gate: RequestGate, scope: string): void {
  if (gate.scope === scope) return
  gate.scope = scope
  gate.generation += 1
}

export function beginRequest(gate: RequestGate, scope: string): RequestTicket {
  syncRequestScope(gate, scope)
  gate.generation += 1
  return { generation: gate.generation, scope }
}

export function invalidateRequests(gate: RequestGate): void {
  gate.generation += 1
}

export const acceptsResponse = (
  gate: RequestGate,
  ticket: RequestTicket,
  currentScope: string,
): boolean =>
  gate.generation === ticket.generation &&
  gate.scope === currentScope &&
  ticket.scope === currentScope

export const acceptsMountedResponse = (
  mounted: boolean,
  gate: RequestGate,
  ticket: RequestTicket,
  currentScope: string,
): boolean => mounted && acceptsResponse(gate, ticket, currentScope)
