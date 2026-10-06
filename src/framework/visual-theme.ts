import type {Manifest} from './types.ts';
import {object} from './guards.ts';
/** Explicit adapters to the existing engines' theme contracts, not global SVG overrides. */
export function withSiteChartTheme(input:unknown,theme:Manifest['theme']):unknown{
  if(theme.mode!=='dark')return input;
  if(!object(input))throw new Error('Expected a generated chart specification');
  return {...input,theme:{ink:'#e1ebf5',muted:'#a1b3c6',grid:'#293e50',background:'#0f1b29',palette:[theme.accent,'#b79adb','#75c3a6','#d7b47b','#739bda','#d594a1']}};
}
export function siteSemanticTheme(theme:Manifest['theme']){
  return theme.mode==='dark'?{surface:'#111f2e',surfaceRaised:'#152b3e',ink:'#e1ebf5',mutedInk:'#a1b3c6',border:'#3a546c',grid:'#263c51',accent:theme.accent,accentSubtle:'#20445c',success:'#75c3a6',warning:'#d7b47b',error:'#e899a0'}:{accent:theme.accent};
}
