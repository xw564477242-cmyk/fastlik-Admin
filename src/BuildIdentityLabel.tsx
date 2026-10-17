import { runtimeConfig } from './runtimeConfig'

export function BuildIdentityLabel() {
  const identity = runtimeConfig.buildIdentity
  return <span className="build-identity" data-candidate-id={identity.candidateId || 'UNBOUND'} data-source-commit={identity.sourceCommit} title={'Base commit: ' + identity.sourceCommit + '; ' + identity.status}>{identity.displayLabel}</span>
}
