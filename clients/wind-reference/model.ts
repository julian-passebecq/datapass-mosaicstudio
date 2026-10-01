/** Illustrative constant-output model, not a bankable energy/yield or finance model. */
export type WindInputs={powerMW:number;capacityFactor:number;capex:number;opex:number;years:number;discount:number};
export function annualEnergy(powerMW:number,capacityFactor:number){
  if(!Number.isFinite(powerMW)||powerMW<=0||!Number.isFinite(capacityFactor)||capacityFactor<=0||capacityFactor>1)throw new Error('Invalid energy inputs');
  return powerMW*8760*capacityFactor;
}
export function capitalRecoveryFactor(rate:number,years:number){
  if(!Number.isFinite(rate)||rate<0||rate>1||!Number.isInteger(years)||years<1||years>100)throw new Error('Invalid annualization inputs');
  return rate===0?1/years:rate/-Math.expm1(-years*Math.log1p(rate));
}
export function indicativeLcoe(v:WindInputs){
  if(!Number.isFinite(v.capex)||v.capex<0||!Number.isFinite(v.opex)||v.opex<0)throw new Error('Invalid cost inputs');
  const aep=annualEnergy(v.powerMW,v.capacityFactor),annualCost=v.capex*capitalRecoveryFactor(v.discount,v.years)+v.opex;
  return {aep,annualCost,lcoe:annualCost/aep};
}
