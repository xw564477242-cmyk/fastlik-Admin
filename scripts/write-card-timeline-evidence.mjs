import { writeFileSync } from 'node:fs'
import { adminCardTimelineContractEvidence } from '../src/cardTimelineContract.ts'

const evidence = adminCardTimelineContractEvidence(process.env.SOURCE_SHA ?? '')
writeFileSync('card-timeline-contract-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
console.log(`Card timeline contract evidence recorded for ${evidence.sourceCommit}`)
