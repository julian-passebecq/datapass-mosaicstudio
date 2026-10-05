/** Viz design tokens: Fluent-2-like neutrals (values follow webLightTheme / webDarkTheme)
 * plus a validated categorical palette, one-hue sequential ramp and a diverging pair.
 * Charts read CSS custom properties only (`var(--dp-viz-*)`); this file is the single
 * place hex values live for the viz path. Everything is overridable per app.
 */
export type VizMode='light'|'dark';
export type VizTokens={
  canvas:string;surface:string;surfaceRaised:string;surfaceHover:string;border:string;borderStrong:string;
  ink:string;inkSecondary:string;inkMuted:string;grid:string;axis:string;
  accent:string;accentInk:string;accentSubtle:string;focus:string;selection:string;dim:string;
  tooltip:string;tooltipInk:string;shimmer:string;shimmerHighlight:string;
  positive:string;negative:string;warning:string;
  categorical:readonly string[];sequential:readonly string[];diverging:readonly string[];
};
/* Sequential runs from the surface toward emphasis: light-to-dark on light, dark-to-light on dark. */
/** Categorical order validated for CVD separation on adjacent pairs (light and dark steps). */
const CATEGORICAL_LIGHT=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
const CATEGORICAL_DARK=['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767'];
const SEQUENTIAL=['#cde2fb','#b7d3f6','#9ec5f4','#86b6ef','#6da7ec','#5598e7','#3987e5','#2a78d6','#256abf','#1c5cab','#184f95','#104281','#0d366b'];
const DIVERGING_LIGHT=['#0d366b','#1c5cab','#3987e5','#86b6ef','#cde2fb','#f0efec','#f8c9c4','#ee9a93','#e34948','#b52f2f','#7f1f1f'];
const DIVERGING_DARK=['#0d366b','#1c5cab','#3987e5','#6da7ec','#9ec5f4','#383835','#f3b3ad','#ec8a83','#e66767','#c23b3b','#8e2525'];

export const lightTokens:VizTokens=Object.freeze({
  canvas:'#f5f5f5',surface:'#ffffff',surfaceRaised:'#fafafa',surfaceHover:'#f0f0f0',border:'#e0e0e0',borderStrong:'#d1d1d1',
  ink:'#242424',inkSecondary:'#424242',inkMuted:'#616161',grid:'#ebebeb',axis:'#c7c7c7',
  accent:'#0f6cbd',accentInk:'#ffffff',accentSubtle:'#ebf3fc',focus:'#000000',selection:'#0f6cbd',dim:'0.28',
  tooltip:'#ffffff',tooltipInk:'#242424',shimmer:'#ececec',shimmerHighlight:'#f8f8f8',
  positive:'#107c10',negative:'#c50f1f',warning:'#bc4b09',
  categorical:CATEGORICAL_LIGHT,sequential:SEQUENTIAL,diverging:DIVERGING_LIGHT,
});
export const darkTokens:VizTokens=Object.freeze({
  canvas:'#141414',surface:'#1f1f1f',surfaceRaised:'#292929',surfaceHover:'#333333',border:'#333333',borderStrong:'#525252',
  ink:'#ffffff',inkSecondary:'#d6d6d6',inkMuted:'#adadad',grid:'#2e2e2e',axis:'#525252',
  accent:'#479ef5',accentInk:'#0a0a0a',accentSubtle:'#082338',focus:'#ffffff',selection:'#479ef5',dim:'0.25',
  tooltip:'#2b2b2b',tooltipInk:'#ffffff',shimmer:'#262626',shimmerHighlight:'#323232',
  positive:'#54b054',negative:'#dc626d',warning:'#f87528',
  categorical:CATEGORICAL_DARK,sequential:[...SEQUENTIAL].reverse(),diverging:DIVERGING_DARK,
});
export type TokenOverrides=Partial<Omit<VizTokens,'categorical'|'sequential'|'diverging'>>&{categorical?:readonly string[];sequential?:readonly string[];diverging?:readonly string[]};
const HEX=/^#[0-9a-fA-F]{6}$/;
/** Merge overrides (e.g. manifest.theme.accent) into a mode's tokens. Colours must be #rrggbb. */
export function vizTokens(mode:VizMode,overrides:TokenOverrides={}):VizTokens{
  const base=mode==='dark'?darkTokens:lightTokens,out:Record<string,unknown>={...base};
  for(const[key,value]of Object.entries(overrides)){
    if(value===undefined)continue;
    if(!(key in base))throw new Error('Unknown viz token: '+key);
    if(Array.isArray(value)){if(!value.length||value.length>16||!value.every(v=>HEX.test(v)))throw new Error('Viz palette '+key+' needs 1..16 #rrggbb colours');out[key]=[...value];}
    else if(key==='dim'){if(!(Number(value)>=0&&Number(value)<=1))throw new Error('Viz dim must be 0..1');out[key]=String(value);}
    else{if(typeof value!=='string'||!HEX.test(value))throw new Error('Viz token '+key+' must be #rrggbb');out[key]=value;}
  }
  return Object.freeze(out) as VizTokens;
}
const kebab=(key:string)=>key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
/** Flatten tokens to `--dp-viz-*` custom properties (palettes become numbered slots, 1-based). */
export function tokenVars(tokens:VizTokens):Record<string,string>{
  const vars:Record<string,string>={};
  for(const[key,value]of Object.entries(tokens)){
    if(Array.isArray(value))value.forEach((v,i)=>{vars[`--dp-viz-${kebab(key)}-${i+1}`]=v;});
    else vars['--dp-viz-'+kebab(key)]=value as string;
  }
  return vars;
}
export function tokenCss(selector:string,tokens:VizTokens):string{
  return selector+'{'+Object.entries(tokenVars(tokens)).map(([k,v])=>k+':'+v).join(';')+'}';
}
/** CSS reference for a categorical slot (0-based index, wraps only inside the declared slots). */
export const cat=(index:number,slots=8)=>`var(--dp-viz-categorical-${(index%slots)+1})`;
export const v=(name:Exclude<keyof VizTokens,'categorical'|'sequential'|'diverging'>)=>`var(--dp-viz-${kebab(name)})`;
/** Canvas cannot read `var()`: resolve the live custom properties of an element. */
export function resolveVars(element:Element,names:readonly string[]):Record<string,string>{
  const style=getComputedStyle(element),out:Record<string,string>={};
  for(const name of names)out[name]=style.getPropertyValue(name).trim();
  return out;
}
