export type TreasuryDashboard={generatedAt:string;accounts:{usdt:number;fiat:number;sponsorReserve:number;requiredReserve:number};liquidity:{ratio:number;minRatio:number;targetRatio:number;autoTopup:boolean;totalLiquidity:number};settlements:Array<{id:string;tenant:string;amount:number;currency:string;status:string;scheduledAt:string;completedAt:string|null}>;logs:Array<{id:string;time:string;event:string;detail:string;status:string}>}

const DEFAULT_API='https://exquisite-surprise-production-309d.up.railway.app/api'
export const getApiBase=()=>localStorage.getItem('fastlink_api_base')||DEFAULT_API
export const setApiBase=(value:string)=>localStorage.setItem('fastlink_api_base',value.replace(/\/$/,''))

async function request<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`${getApiBase()}${path}`,{...init,headers:{'Content-Type':'application/json',...(init?.headers||{})}})
 if(!response.ok){let message=`API ${response.status}`;try{const body=await response.json();message=body.message||message}catch{}throw new Error(message)}
 return response.json() as Promise<T>
}
export const treasuryApi={
 dashboard:()=>request<TreasuryDashboard>('/treasury/dashboard'),
 rebalance:(targetRatio:number)=>request('/treasury/rebalance',{method:'POST',body:JSON.stringify({targetRatio})}),
 settle:()=>request('/treasury/settlement/run',{method:'POST',body:'{}'}),
 fx:(from:string,to:string,amount:number)=>request('/treasury/fx',{method:'POST',body:JSON.stringify({from,to,amount})}),
 simulateUsdt:(amount=50000)=>request('/treasury/simulate/usdt-deposit',{method:'POST',body:JSON.stringify({amount})}),
 simulateReserveDemand:(amount=50000)=>request('/treasury/simulate/reserve-demand',{method:'POST',body:JSON.stringify({amount})})
}
