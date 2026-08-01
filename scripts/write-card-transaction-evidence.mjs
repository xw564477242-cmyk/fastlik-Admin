import { writeFileSync } from 'node:fs'
import { adminCardTransactionContractEvidence } from '../src/cardTransactionContract.ts'

const evidence = adminCardTransactionContractEvidence(process.env.SOURCE_SHA ?? '')
writeFileSync('card-transaction-contract-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
console.log(`Card transaction contract evidence recorded for ${evidence.sourceCommit}`)
