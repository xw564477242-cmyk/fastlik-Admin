import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(new URL('../src/AdminWritePanels.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')

test('Admin exposes tenant referral cap read and write controls with the platform ceiling', () => {
  assert.match(panel, /4\. 租户分润上限/)
  assert.match(panel, /productionApi\.feePolicy/)
  assert.match(panel, /productionApi\.setReferralCap/)
  assert.match(panel, /max=\{referralPolicy\.platformReferralFeeRateCap\}/)
  assert.match(panel, /保存分润上限/)
  assert.match(api, /adminRoutes\.referralCap\(tenantId\),key,'PUT'/)
})
