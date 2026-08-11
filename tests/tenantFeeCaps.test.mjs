import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(new URL('../src/AdminWritePanels.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/productionApi.ts', import.meta.url), 'utf8')

test('Admin binds the current tenant fee-cap write contract without referral-cap overlap', () => {
  assert.match(panel, /4\. 租户费率上限/)
  assert.match(panel, /productionApi\.setFeeCaps/)
  assert.match(panel, /tenantFeeCapFields/)
  assert.match(panel, /保存费率上限/)
  assert.match(api, /TenantFeeCapValues=Required<Omit<CardFeeValues,'referralFeeRate'>>/)
  assert.match(api, /adminRoutes\.feeCaps\(tenantId\),key,'PUT'/)
})

test('tenant fee-cap submission sends only the seven OpenAPI cap fields plus audit reason', () => {
  const submission = panel.slice(panel.indexOf('const submitFeeCaps'), panel.indexOf('useEffect(() => { if (allowed)'))
  for (const field of ['cardIssueFee', 'cardMonthlyFee', 'usdtDepositRate', 'cardSpendRate', 'assetWithdrawRate', 'cashWithdrawRate', 'thirdPartyPayRate']) {
    assert.match(submission, new RegExp(`${field}: feeCaps\\.${field}`))
  }
  assert.doesNotMatch(submission, /referralFeeRate: feeCaps\.referralFeeRate/)
  assert.match(submission, /reason: feeCapReason/)
})
