/** SYNTHETIC "Contoso sales" orders for the viz gallery. Deterministic (seeded PRNG); no client,
 * customer or production data. Columnar typed arrays keep 50k rows cheap to filter per frame.
 */
export const REGIONS=[{key:'na',label:'North America'},{key:'eu',label:'Europe'},{key:'apac',label:'Asia Pacific'},{key:'latam',label:'Latin America'}] as const;
export const CATEGORIES=[{key:'bikes',label:'Bikes'},{key:'components',label:'Components'},{key:'clothing',label:'Clothing'},{key:'accessories',label:'Accessories'},{key:'services',label:'Services'}] as const;
export const CHANNELS=[{key:'online',label:'Online'},{key:'retail',label:'Retail'},{key:'partner',label:'Partner'},{key:'direct',label:'Direct'}] as const;
export const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
export const STORE_COUNT=48;
export const STORES=Array.from({length:STORE_COUNT},(_,i)=>({key:'s'+String(i+1).padStart(2,'0'),label:'Store '+String(i+1).padStart(2,'0'),region:i%REGIONS.length}));
export const DISCOUNT_RANGE=[0,40] as const,MARGIN_RANGE=[-40,80] as const;
export type Orders={length:number;region:Uint8Array;category:Uint8Array;channel:Uint8Array;month:Uint8Array;store:Uint8Array;revenue:Float64Array;units:Uint16Array;discount:Float64Array;margin:Float64Array};

function mulberry32(seed:number){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function pick(r:number,weights:readonly number[]){let acc=0;const total=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++){acc+=weights[i]!/total;if(r<acc)return i;}return weights.length-1;}
const round=(n:number,d=2)=>Math.round(n*10**d)/10**d;
/** Generate `count` synthetic orders. Same seed → byte-identical arrays. */
export function generateOrders(count=50000,seed=20261005):Orders{
  const rnd=mulberry32(seed),gauss=()=>{let u=0,w=0;while(u===0)u=rnd();while(w===0)w=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*w);};
  const o:Orders={length:count,region:new Uint8Array(count),category:new Uint8Array(count),channel:new Uint8Array(count),month:new Uint8Array(count),store:new Uint8Array(count),revenue:new Float64Array(count),units:new Uint16Array(count),discount:new Float64Array(count),margin:new Float64Array(count)};
  const basePrice=[1450,180,62,38,420],baseMargin=[24,31,44,52,38],channelDiscount=[6,9,15,4];
  const season=[0.78,0.74,0.9,1.0,1.1,1.16,1.08,1.02,1.12,1.2,1.34,1.52];
  for(let i=0;i<count;i++){
    const store=Math.floor(rnd()*STORE_COUNT),region=STORES[store]!.region,category=pick(rnd(),[3,5,4,6,2]),channel=pick(rnd(),[region===2?5:4,4,2,1.5]);
    const month=pick(rnd(),season.map((s,m)=>s*(1+m*0.012*(region+1))));
    const units=1+Math.floor(Math.abs(gauss())*(category===0?1.2:4));
    const raw=(channelDiscount[channel]!+(month>=10?4:0))*Math.exp(gauss()*0.55),discount=raw>39.5?18+rnd()*21:raw;
    const price=basePrice[category]!*Math.exp(gauss()*0.35)*(1+region*0.04);
    const revenue=round(price*units*(1-discount/100));
    const margin=Math.min(79.9,Math.max(-39.9,baseMargin[category]!-discount*0.9+gauss()*8-(channel===2?4:0)));
    o.region[i]=region;o.category[i]=category;o.channel[i]=channel;o.month[i]=month;o.store[i]=store;o.units[i]=units;o.revenue[i]=revenue;o.discount[i]=round(discount);o.margin[i]=round(margin);
  }
  return o;
}
