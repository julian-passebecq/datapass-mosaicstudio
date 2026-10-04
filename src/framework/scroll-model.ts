/** Finite authored stops, shared by native scroll consumers. No clock or interpolation. */
export function chapterAt(progress:number,count:number):number {
  if(!Number.isFinite(progress)||!Number.isInteger(count)||count<1)throw new Error('Invalid scroll chapter input');
  return Math.min(count-1,Math.max(0,Math.round(Math.max(0,Math.min(1,progress))*(count-1))));
}
