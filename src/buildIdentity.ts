export type BuildIdentityInput = Readonly<{
  buildSha?: unknown
  runtimeBuildSha?: unknown
  sourceSnapshot?: unknown
  candidateId?: unknown
}>

function text(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Invalid build identity field: ' + field)
  return value.trim() || undefined
}

function sourceCommit(value: unknown, field: string): string | undefined {
  const commit = text(value, field)
  if (commit && !/^[0-9a-f]{40}$/i.test(commit)) throw new Error('Invalid 40-hex source commit: ' + field)
  return commit?.toLowerCase()
}

export function resolveBuildIdentity(input: BuildIdentityInput) {
  const buildSha = sourceCommit(input.buildSha, 'VITE_FASTLINK_BUILD_SHA')
  const runtimeSha = sourceCommit(input.runtimeBuildSha, 'runtime.buildSha')
  const candidateId = text(input.candidateId, 'VITE_FASTLINK_CANDIDATE_ID')
  if (candidateId && !/^FL-LAUNCH-B[1-9][0-9]*-[0-9]{8}(?:-[a-z0-9]+)*$/.test(candidateId)) {
    throw new Error('Invalid candidate ID; it is not a Git SHA')
  }
  if (candidateId && !buildSha) throw new Error('UNBOUND_CANDIDATE: missing build-time source commit')
  if (buildSha && runtimeSha && buildSha !== runtimeSha) throw new Error('Conflicting build-time and runtime source commits')
  const commit = buildSha || runtimeSha
  if (!commit) throw new Error('UNBOUND_SOURCE_COMMIT')
  const snapshot = text(input.sourceSnapshot, 'VITE_FASTLINK_SOURCE_SNAPSHOT')
  if (snapshot && !/^[0-9a-f]{64}$/.test(snapshot)) throw new Error('Invalid source snapshot')
  if (snapshot && !candidateId) throw new Error('UNBOUND_CANDIDATE')
  const status = snapshot ? 'PREVIEW_SOURCE_SNAPSHOT_BOUND_NOT_DEPLOYED' : candidateId ? 'CANDIDATE_VERSION_BOUND_NOT_DEPLOYED' : 'SOURCE_COMMIT_ONLY_NOT_CANDIDATE_BOUND'
  const deployment = candidateId ? 'NOT_DEPLOYED' : 'NOT_VERIFIED'
  return Object.freeze({
    sourceCommit: commit,
    sourceSnapshot: snapshot || null,
    source: buildSha ? 'BUILD_TIME' : 'RUNTIME_SOURCE_ONLY',
    candidateId: candidateId || null,
    status,
    deployment,
    displayLabel: 'Candidate: ' + (candidateId || 'UNBOUND') + ' · Base: ' + commit.slice(0, 12) + ' · ' + (snapshot ? 'Snapshot: ' + snapshot.slice(0,12) + ' · Stage: PREVIEW_BUILD · Release: UNBOUND' : deployment),
  })
}
