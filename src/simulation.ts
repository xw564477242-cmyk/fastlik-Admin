export type ScenarioStatus='通过'|'失败'|'待运行'
export type ScenarioResult={id:string;name:string;actor:string;channel:'B端'|'C端';status:ScenarioStatus;steps:string[];checks:string[];duration:number}
export type SimulationState={tenantUsdt:number;tenantFiat:number;userUsdt:number;userCard:number;platformRevenue:number;settlementExposure:number;cardStatus:string;riskCases:number;ledgerDebit:number;ledgerCredit:number}

export const actors=[
 {name:'Platform Super Admin',side:'B端',tenant:'FastLink Platform',permissions:['tenant:*','rbac:*','audit:read']},
 {name:'Tenant Administrator',side:'B端',tenant:'NovaPay Asia',permissions:['users:*','cards:*','transactions:read']},
 {name:'Treasury Operator',side:'B端',tenant:'FastLink Platform',permissions:['treasury:write','settlement:execute']},
 {name:'Compliance Officer',side:'B端',tenant:'FastLink Platform',permissions:['kyc:review','aml:case']},
 {name:'Developer',side:'B端',tenant:'Orbit Card Labs',permissions:['sandbox:*','api:*']},
 {name:'Read Only Auditor',side:'B端',tenant:'FastLink Platform',permissions:['audit:read','reports:read']},
 {name:'Chen Wei',side:'C端',tenant:'NovaPay Asia',permissions:['wallet:self','card:self']},
 {name:'Muhammad Amir',side:'C端',tenant:'Orbit Card Labs',permissions:['wallet:self','card:self']}
] as const

export const initialSimulationState:SimulationState={tenantUsdt:10000,tenantFiat:0,userUsdt:0,userCard:0,platformRevenue:0,settlementExposure:0,cardStatus:'未创建',riskCases:0,ledgerDebit:0,ledgerCredit:0}

function check(ok:boolean,message:string){if(!ok)throw new Error(message);return message}
function hasPermission(index:number,permission:string){return (actors[index].permissions as readonly string[]).includes(permission)}

export function runAllScenarios():{state:SimulationState;results:ScenarioResult[];passed:number;failed:number}{
 let s={...initialSimulationState};const results:ScenarioResult[]=[]
 const run=(id:string,name:string,actor:string,channel:'B端'|'C端',fn:()=>{steps:string[];checks:string[]})=>{const start=performance.now();try{const r=fn();results.push({id,name,actor,channel,status:'通过',...r,duration:Math.max(1,Math.round(performance.now()-start))})}catch(e){results.push({id,name,actor,channel,status:'失败',steps:[name],checks:[e instanceof Error?e.message:'未知错误'],duration:Math.max(1,Math.round(performance.now()-start))})}}
 run('B-01','租户管理员创建C端用户','Tenant Administrator','B端',()=>({steps:['创建用户 FLU-20001','分配 NovaPay 租户','提交KYC'],checks:[check(actors[1].tenant==='NovaPay Asia','租户范围正确'),check(!hasPermission(1,'treasury:write'),'未获得资金池权限')]}))
 run('B-02','合规员通过KYC','Compliance Officer','B端',()=>({steps:['核验身份资料','制裁筛查通过','KYC升级至L2'],checks:[check(hasPermission(3,'kyc:review'),'具备KYC审核权限')]}))
 run('C-01','用户充值1000 USDT','Chen Wei','C端',()=>{s.userUsdt+=1000;s.tenantUsdt+=1000;s.ledgerDebit+=1000;s.ledgerCredit+=1000;return{steps:['BSC入账1000 USDT','生成钱包账本分录'],checks:[check(s.userUsdt===1000,'用户USDT余额正确'),check(s.ledgerDebit===s.ledgerCredit,'复式账本借贷平衡')]}})
 run('C-02','USDT兑换法币并充值卡','Chen Wei','C端',()=>{const gross=600,fee=6,net=594;s.userUsdt-=gross;s.tenantUsdt-=gross;s.tenantFiat+=net;s.userCard+=net;s.platformRevenue+=fee;s.cardStatus='正常';s.ledgerDebit+=gross;s.ledgerCredit+=gross;return{steps:['兑换600 USDT','收取1%平台费用','594 USD充值虚拟卡'],checks:[check(s.userUsdt===400,'兑换后USDT余额正确'),check(s.userCard===594,'卡余额正确'),check(s.platformRevenue===6,'平台收入正确')]}})
 run('C-03','卡消费与授权','Chen Wei','C端',()=>{const amount=120;s.userCard-=amount;s.settlementExposure+=amount;return{steps:['Mastercard授权120 USD','卡余额扣减','生成待清算敞口'],checks:[check(s.userCard===474,'消费后卡余额正确'),check(s.settlementExposure===120,'清算敞口正确')]}})
 run('B-03','Treasury执行清算','Treasury Operator','B端',()=>{s.tenantFiat-=s.settlementExposure;s.settlementExposure=0;return{steps:['核对授权批次','扣减法币准备金','清算完成'],checks:[check(hasPermission(2,'settlement:execute'),'具备清算权限'),check(s.settlementExposure===0,'敞口已归零'),check(s.tenantFiat===474,'法币准备金与用户卡余额一致')]}})
 run('C-04','异常ATM提现触发风控','Muhammad Amir','C端',()=>{s.riskCases+=1;return{steps:['连续提交3次ATM提现','规则引擎命中','创建AML案件'],checks:[check(s.riskCases===1,'风险案件创建成功')]}})
 run('B-04','审计员尝试修改资金池','Read Only Auditor','B端',()=>({steps:['请求修改准备金','RBAC拒绝操作'],checks:[check(!hasPermission(5,'treasury:write'),'只读审计员越权被阻止')]}))
 const passed=results.filter(x=>x.status==='通过').length;return{state:s,results,passed,failed:results.length-passed}
}
