export const DEFAULT_API = 'https://exquisite-surprise-production-309d.up.railway.app/api'

export type DataSource = 'SANDBOX' | 'OFFICIAL_UAT' | 'PRODUCTION'
export const dataSourceLabel=(value:DataSource)=>value==='OFFICIAL_UAT'?'OFFICIAL UAT':value
export type Health = {status:string;service:string;release:string;checks:{process?:string;database?:string;schema?:string};responseTimeMs?:number;timestamp:string}
export type AdminSession = {accessToken:string;tokenType:'Bearer';expiresInSeconds:number;expiresAt:string;user:{id:string;email:string;tenantId:string;environment:DataSource;roles:string[];permissions:string[]}}
export type Tenant = {id:string;legalName:string;brandName:string;slug:string;status:string;environment:DataSource}
export type TrialBalance = {assetCode:string;debit:string;credit:string;balanced:boolean}
export type TreasuryPosition = {assetCode:string;sponsorReserve:string;requiredReserve:string;availableBalance:string;authorizationHold:string;pendingSettlement:string;totalControlled?:string;liquidityRatio:string|null;updatedAt?:string}
export type Reconciliation = {
 generatedAt:string;dataSource:string;evidencePresent:boolean
 status:'MATCHED'|'DISCREPANCY'|'NO_DATA'
 pendingChecks:Array<{assetCode:string;expectedPendingSettlement:string;treasuryPendingSettlement:string;difference:string;matched:boolean}>
 authorizationHoldChecks:Array<{assetCode:string;expectedAuthorizationHold:string;treasuryAuthorizationHold:string;difference:string;matched:boolean}>
 clearingDifferenceChecks:Array<{assetCode:string;clearingDifference:string;expectedAuthorizationHold:string;matched:boolean}>
 journalChecks:Array<{assetCode:string;debit:string;credit:string;matched:boolean}>
 trialBalance:TrialBalance[]
 externalReconciliation:{bank:{status:'BLOCKED';blocker:string};processor:{status:'BLOCKED';blocker:string}}
}
export type Contamination = {tenantId:string;environment:string;dataSource:string;status:'CLEAN'|'CONTAMINATED';total:number;counts:Record<string,number>;generatedAt:string}
export type WalletAccount = {id:string;accountCode:string;name:string;customerId?:string;assetCode:string;purpose:string;status:string;postedBalance:string;pendingBalance:string}
export type Journal = {id:string;referenceType:string;referenceId?:string;idempotencyKey:string;description:string;status:string;postedAt:string;entries:Array<{id:string;walletAccountId:string;side:'DEBIT'|'CREDIT';amount:string;assetCode:string;memo?:string}>}
export type Merchant = {id:string;externalMerchantId:string;name:string;mcc:string;settlementAssetCode:string;status:string;createdAt:string}
export type MerchantPayment = {id:string;merchantId:string;walletAccountId:string;cardId?:string;status:string;assetCode:string;amount:string;journalIds:string[];settlementBatchId?:string;createdAt:string;merchant?:Merchant}
export type Page<T> = {data:T[];total:number;limit:number;offset:number}
export type TraceReport = {
 traceId:string;tenantId:string;environment:string;dataSource:string;generatedAt:string;status:'CONSISTENT'|'DISCREPANCY';operationalStatus:'READY'|'BLOCKED'
 externalEvidenceRequirements:Array<{provider:string;classification:string;status:'BLOCKED';blocker:string}>
 checks:{journalBalanced:boolean;trialBalanceBalanced:boolean;webhookFinanciallyPosted:boolean;auditPresent:boolean}
 summary:Record<string,number>
 customers:Array<Record<string,unknown>>;wallets:Array<Record<string,unknown>>;cards:Array<Record<string,unknown>>
 cardTransactions:Array<Record<string,unknown>>;walletOperations:Array<Record<string,unknown>>
 merchantPayments:Array<Record<string,unknown>>;merchants:Array<Record<string,unknown>>
 journals:Array<Record<string,unknown>>;treasury:Array<Record<string,unknown>>;settlements:Array<Record<string,unknown>>
 webhooks:Array<Record<string,unknown>>;audits:Array<Record<string,unknown>>;trialBalance:TrialBalance[]
}
export type IntegrationReadiness={
 status:'PASS'|'BLOCKED';externalUatEntryStatus:'READY'|'BLOCKED';generatedAt:string
 providers:Record<string,{target:string;classification:string;status:'PASS'|'BLOCKED';configurationStatus:'PASS'|'BLOCKED';verificationStatus:'PASS'|'BLOCKED'}>
 releaseGate:Record<string,'PASS'|'BLOCKED'>;disclosure:string
}
export type EvidenceSummary={
 generatedAt:string;dataSource:string;status:'PASS'|'BLOCKED';artifactCount:number;immutable:true
 categories:Array<{
  category:string;status:'PASS'|'BLOCKED';missing:string[]
  operations:Array<{operation:string;evidence:null|{result:'PASS'|'FAIL'|'BLOCKED';capturedAt:string;contentHash:string}}>
 }>
}
export type FinancialOperationalReport={reportType:'FINANCIAL_OPERATIONAL_REPORT';generatedAt:string;businessDate:string;dataSource:string;status:'PASS'|'BLOCKED';internalFinancialStatus:'PASS'|'BLOCKED';externalReconciliationStatus:'PASS'|'BLOCKED';activity:Record<string,number>;blockers:string[]}
export type ThreddRegion='0'|'1'|'2'
export type CertificateMetadata={kind:'TRANSPORT'|'SIGNING';subject:string;serialNumber:string;kid?:string;issuedAt:string;expiresAt:string;state:'ACTIVE'|'RENEWAL_DUE'|'EXPIRED'}
export type ThreddPartnerConfiguration={
 provider:'THREDD';dataSource:DataSource;xRegion:ThreddRegion;region?:ThreddRegion;regionName:'DEFAULT'|'EMEA'|'APAC';status:'READY'|'BLOCKED';active:boolean;
 applicationName:string;applicationVersion:string;softwareRole:string;apiHosts:string[];discoveryConfigured:boolean;
 credentials:{organisationId:boolean;applicationId:boolean;clientId:boolean;signingKid:boolean;ssa:boolean;transportCertificate:boolean;signingCertificate:boolean};
 certificates:CertificateMetadata[];updatedAt:string;updatedBy?:string;blockers:string[]
}
type ThreddPartnerConfigurationResponse={
 configuration?:null|{partner?:string;dataSource?:DataSource;xRegion?:ThreddRegion;active?:boolean;updatedAt?:string};
 runtime?:{dataSource?:DataSource;xRegion?:ThreddRegion|null;aligned?:boolean;deploymentRequired?:boolean};
 partnerMetadata?:null|{applicationName?:string;version?:string;softwareRole?:string;updatedAt?:string};
 certificates?:Array<{kind?:string;subject?:string;serialNumber?:string;kid?:string;issuedDate?:string;expiryDate?:string;state?:string}>;
 dcrClients?:Array<{status?:string;certificateKid?:string}>;
 officialUatStatus?:'READY'|'BLOCKED'
}
export type PartnerCardProduct={
 id:string;dataSource:DataSource;partner:string;bin:string;subBin?:string;cardProduct:number;cardType:'VIRTUAL'|'PHYSICAL';cardNetwork:'VISA'|'MASTERCARD';scheme?:string;
 active:boolean;multiFxEnabled?:boolean;controlGroups?:string[];config3DSecureEnabled?:boolean;networkSharingDefault?:boolean;createdAt?:string;updatedAt?:string
}
export type PartnerCardProductInput=Omit<PartnerCardProduct,'id'|'createdAt'|'updatedAt'>
export type CardProductionProfile={cardManufacturer?:string;deliveryMethod?:number;carrierType?:string;quantity?:number;language?:string;thermalLine1?:string;thermalLine2?:string;embossLine4?:string;vanityName?:string;imageDetails?:{imageId?:string;logoFrontId?:string;logoBackId?:string}}
export type CardDesign={id:string;partnerCardProductId?:string;designCode:string;name:string;productionProfile:CardProductionProfile;active:boolean;createdAt?:string;updatedAt?:string}
export type CardDesignInput=Omit<CardDesign,'id'|'createdAt'|'updatedAt'>
export type ManagedCard={
 id:string;customerId:string;environment:string;provider:string;publicToken:string;type:'VIRTUAL'|'PHYSICAL';status:string;maskedPan?:string;last4?:string;expiryMonth?:number;expiryYear?:number;currency:string;alias?:string;
 balance?:{availableBalanceMinor:string;currentBalanceMinor:string;pendingAmountMinor:string;currency:string;updatedAt:string}|null;
 holder?:Record<string,unknown>|null;partnerCardProduct?:PartnerCardProduct|null;
 manufacturing?:{emboss?:unknown;carrier?:unknown;language?:string;image?:unknown;thermal?:unknown;vanity?:string;deliveryConfigured:boolean;cardDesignId?:string}|null;
 profile?:{address?:Record<string,unknown>;fulfilment?:Record<string,unknown>;config3DSecure?:Record<string,unknown>;networkSharing?:boolean}|null;
 mvcParent?:{id:string;publicToken:string}|null;childCards?:Array<{id:string;publicToken:string;status:string}>
}
export type CardProfileUpdate={
 cardHolder?:{title?:string;firstName?:string;middleName?:string;lastName?:string;dateOfBirth?:string;mobile?:string;email?:string};
 address?:{addressLine1:string;addressLine2?:string;city:string;postCode:string;country:string};
 fulfilment?:{addressLine1:string;addressLine2?:string;city:string;postCode:string;country:string;deliveryMethod?:number};
 manufacturing?:CardProductionProfile;config3DSecure?:{mobileNumber?:string;emailAddress?:string;language?:string};networkSharing?:boolean;cardDesignId?:string
}

async function request<T>(base:string,path:string,token?:string,method='GET',body?:unknown):Promise<T>{
 const controller=new AbortController()
 const timeout=window.setTimeout(()=>controller.abort(),20_000)
 try{
  const response=await fetch(`${base.replace(/\/$/,'')}${path}`,{
   mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,
   method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
  })
  if(!response.ok){
   let message=`API ${response.status}`
   try{const body=await response.json();message=Array.isArray(body.message)?body.message.join(', '):(body.detail||body.message||body.title||message)}catch{}
   const requestId=response.headers.get('x-request-id')
   throw new Error(`${message} · ${response.status} ${path}${requestId?` · Trace ${requestId}`:''}`)
  }
  if(response.status===204)return undefined as T
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof DOMException&&error.name==='AbortError')throw new Error(`API timeout · ${path}`)
  throw error
 }finally{window.clearTimeout(timeout)}
}

const query=(environment:DataSource)=>`environment=${encodeURIComponent(environment)}`

export function normalizeThreddConfiguration(value:ThreddPartnerConfigurationResponse):ThreddPartnerConfiguration{
 const configuration=value.configuration
 const metadata=value.partnerMetadata
 const certificates=(value.certificates??[]).flatMap((certificate):CertificateMetadata[]=>{
  if((certificate.kind!=='TRANSPORT'&&certificate.kind!=='SIGNING')||!certificate.subject||!certificate.serialNumber||!certificate.issuedDate||!certificate.expiryDate)return[]
  const state:CertificateMetadata['state']=certificate.state==='ACTIVE'?'ACTIVE':certificate.state==='EXPIRED'?'EXPIRED':'RENEWAL_DUE'
  return[{kind:certificate.kind,subject:certificate.subject,serialNumber:certificate.serialNumber,...(certificate.kid?{kid:certificate.kid}:{}),issuedAt:certificate.issuedDate,expiresAt:certificate.expiryDate,state}]
 })
 const activeClient=(value.dcrClients??[]).find(client=>client.status==='ACTIVE')
 const signingCertificate=certificates.find(certificate=>certificate.kind==='SIGNING')
 const transportCertificate=certificates.some(certificate=>certificate.kind==='TRANSPORT'&&certificate.state==='ACTIVE')
 const status=value.officialUatStatus==='READY'?'READY':'BLOCKED'
 const dataSource=configuration?.dataSource??value.runtime?.dataSource??'SANDBOX'
 const xRegion=configuration?.xRegion??value.runtime?.xRegion??'0'
 return{
  provider:'THREDD',dataSource,xRegion,region:xRegion,regionName:xRegion==='1'?'EMEA':xRegion==='2'?'APAC':'DEFAULT',status,active:configuration?.active??false,
  applicationName:metadata?.applicationName??'',applicationVersion:metadata?.version??'',softwareRole:metadata?.softwareRole??'',apiHosts:[],discoveryConfigured:Boolean(value.runtime?.aligned),
  credentials:{organisationId:false,applicationId:Boolean(metadata),clientId:Boolean(activeClient),signingKid:Boolean(signingCertificate?.kid||activeClient?.certificateKid),ssa:false,transportCertificate,signingCertificate:Boolean(signingCertificate&&signingCertificate.state==='ACTIVE')},
  certificates,updatedAt:configuration?.updatedAt??metadata?.updatedAt??'',blockers:status==='BLOCKED'?['THREDD OFFICIAL UAT = BLOCKED']:[],
 }
}

export const productionApi={
 health:(base:string)=>request<Health>(base,'/health'),
 systemReadiness:(base:string)=>request<Health>(base,'/health/readiness'),
 login:(base:string,tenantId:string,email:string,password:string)=>request<AdminSession>(base,'/admin/auth/login',undefined,'POST',{tenantId,email,password}),
 logout:(base:string,token:string)=>request<{revoked:true}>(base,'/admin/auth/logout',token,'POST'),
 tenant:(base:string,token:string,tenantId:string)=>request<Tenant>(base,`/admin/tenants/${tenantId}`,token),
 readiness:(base:string,token:string,tenantId:string)=>request<IntegrationReadiness>(base,`/admin/tenants/${tenantId}/integrations/readiness`,token),
 treasury:(base:string,key:string,tenantId:string,environment:DataSource)=>request<{generatedAt:string;positions:TreasuryPosition[]}>(base,`/admin/tenants/${tenantId}/dashboards/treasury?${query(environment)}`,key),
 reconciliation:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Reconciliation>(base,`/admin/tenants/${tenantId}/settlement/reconciliation?${query(environment)}`,key),
 trialBalance:(base:string,key:string,tenantId:string,environment:DataSource)=>request<TrialBalance[]>(base,`/admin/tenants/${tenantId}/ledger/trial-balance?${query(environment)}`,key),
 accounts:(base:string,key:string,tenantId:string,environment:DataSource)=>request<WalletAccount[]>(base,`/admin/tenants/${tenantId}/ledger/accounts?${query(environment)}`,key),
 journals:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Journal[]>(base,`/admin/tenants/${tenantId}/ledger/journals?${query(environment)}`,key),
 contamination:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Contamination>(base,`/admin/tenants/${tenantId}/operations/mock-contamination?${query(environment)}`,key),
 merchants:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Page<Merchant>>(base,`/admin/tenants/${tenantId}/merchants?${query(environment)}&limit=100`,key),
 merchantPayments:(base:string,key:string,tenantId:string,environment:DataSource)=>request<Page<MerchantPayment>>(base,`/admin/tenants/${tenantId}/merchant/payments?${query(environment)}&limit=100`,key),
 trace:(base:string,key:string,tenantId:string,environment:DataSource,traceId:string)=>request<TraceReport>(base,`/admin/tenants/${tenantId}/operations/traces/${encodeURIComponent(traceId)}?${query(environment)}`,key),
 evidenceSummary:(base:string,token:string,tenantId:string,environment:DataSource)=>request<EvidenceSummary>(base,`/admin/tenants/${tenantId}/evidence/summary?${query(environment)}`,token),
 dailyClosing:(base:string,token:string,tenantId:string,environment:DataSource)=>request<FinancialOperationalReport>(base,`/admin/tenants/${tenantId}/settlement/daily-closing?${query(environment)}`,token),
 threddConfiguration:async(base:string,token:string,tenantId:string,environment:DataSource)=>normalizeThreddConfiguration(await request<ThreddPartnerConfigurationResponse>(base,`/admin/tenants/${tenantId}/integrations/thredd/configuration?${query(environment)}`,token)),
 updateThreddConfiguration:async(base:string,token:string,tenantId:string,environment:DataSource,body:{xRegion:ThreddRegion})=>{
  await request<unknown>(base,`/admin/tenants/${tenantId}/integrations/thredd/configuration?${query(environment)}`,token,'PUT',{dataSource:environment,partner:'THREDD',xRegion:body.xRegion,active:true})
  return normalizeThreddConfiguration(await request<ThreddPartnerConfigurationResponse>(base,`/admin/tenants/${tenantId}/integrations/thredd/configuration?${query(environment)}`,token))
 },
 cardProducts:(base:string,token:string,tenantId:string)=>request<PartnerCardProduct[]>(base,`/admin/tenants/${tenantId}/cards/products`,token),
 configureCardProduct:(base:string,token:string,tenantId:string,environment:DataSource,body:Omit<PartnerCardProductInput,'dataSource'>)=>request<PartnerCardProduct>(base,`/admin/tenants/${tenantId}/cards/products`,token,'POST',{...body,dataSource:environment}),
 cardDesigns:(base:string,token:string,tenantId:string)=>request<CardDesign[]>(base,`/card-production/tenants/${tenantId}/designs`,token),
 configureCardDesign:(base:string,token:string,tenantId:string,body:CardDesignInput)=>request<CardDesign>(base,`/card-production/tenants/${tenantId}/designs`,token,'POST',body),
 retrieveCard:(base:string,token:string,tenantId:string,publicToken:string)=>request<ManagedCard>(base,`/cards/${encodeURIComponent(publicToken)}?tenantId=${encodeURIComponent(tenantId)}`,token),
 updateCardProfile:(base:string,token:string,tenantId:string,publicToken:string,body:CardProfileUpdate)=>request<void>(base,`/cards/${encodeURIComponent(publicToken)}`,token,'PUT',{tenantId,...body}),
 mapMvcParent:(base:string,token:string,tenantId:string,publicToken:string,parentPublicToken:string)=>request<void>(base,`/card-production/tenants/${tenantId}/cards/${encodeURIComponent(publicToken)}/mvc-parent`,token,'PUT',{parentPublicToken}),
 cardControl:(base:string,token:string,tenantId:string,publicToken:string,action:'freeze'|'unfreeze',idempotencyKey:string)=>request<ManagedCard>(base,`/admin/tenants/${tenantId}/cards/${encodeURIComponent(publicToken)}/${action}`,token,'POST',{idempotencyKey}),
}
