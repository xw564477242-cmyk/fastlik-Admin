import {readFileSync} from 'node:fs'

const api=readFileSync(new URL('../src/merchantApi.ts',import.meta.url),'utf8')
const panel=readFileSync(new URL('../src/MerchantLivePanel.tsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
const required=[
 '/merchants?environment=',
 '/merchant/payments?environment=',
 '/merchants/${merchantId}?environment=',
 '/qr-codes',
 '/merchant/qr/pay',
 "action:'clear'|'settle'|'reverse'|'refund'",
 'x-admin-api-key',
]
for(const value of required){if(!api.includes(value))throw new Error(`Sprint-11 Merchant API contract missing: ${value}`)}
for(const value of ['Merchant Business Closure','Payment History','执行 QR Payment','downloadCsv']){if(!panel.includes(value))throw new Error(`Sprint-11 Merchant Admin acceptance missing: ${value}`)}
if(api.includes('ADMIN_API_KEY='))throw new Error('A credential-like value was hardcoded')
for(const value of ['requestedView','searchParams.set(\'view\',id)','merchanttesting']){if(!app.includes(value))throw new Error(`Sprint-11 direct acceptance link missing: ${value}`)}
console.log('Sprint-11 Merchant API/Admin contract verified')
