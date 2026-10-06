/**
 * Flat 2D glyphs that use the same natural metaphor as the 3D icons (32×32 box, stroke = currentColor,
 * fill hints via the `F` token replaced by the kind color). Pure strings: no DOM, deterministic.
 */
const g:Record<string,string>={
  lake:'<path d="M2 18c4-3 7 3 11 0s7 3 11 0 6 2 6 2"/><path d="M2 24c4-3 7 3 11 0s7 3 11 0 6 2 6 2"/>',
  warehouse:'<path d="M4 28V12l12-7 12 7v16z" fill="F"/><path d="M8 28V15h16v13M8 20h16M8 24h16"/><path d="M11 18h3M18 18h3M12 22h4M17 26h3"/>',
  lakehouse:'<path d="M7 20v-8l9-6 9 6v8z" fill="F"/><path d="M13 20v-5h6v5"/><path d="M2 25c4-2 7 2 11 0s7 2 11 0 6 1 6 1"/>',
  eventhouse:'<ellipse cx="16" cy="7" rx="10" ry="3" fill="F"/><path d="M6 7v18c0 2 5 3 10 3s10-1 10-3V7"/><path d="M6 13c0 2 5 3 10 3s10-1 10-3M6 19c0 2 5 3 10 3s10-1 10-3"/>',
  database:'<ellipse cx="16" cy="8" rx="9" ry="3.5" fill="F"/><path d="M7 8v16c0 2 4 3.5 9 3.5s9-1.5 9-3.5V8M7 16c0 2 4 3.5 9 3.5s9-1.5 9-3.5"/>',
  artifact:'<path d="M9 5h11l5 5v17H9z" fill="F"/><path d="M20 5v5h5"/><path d="M6 8v22h16"/><path d="M13 15h8M13 19h8M13 23h5"/>',
  repo:'<circle cx="10" cy="7" r="3" fill="F"/><circle cx="10" cy="25" r="3" fill="F"/><circle cx="22" cy="12" r="3" fill="F"/><path d="M10 10v12M22 15c0 5-12 3-12 7"/>',
  pipeline:'<path d="M2 13h10v6H2M30 13H20v6h10" /><rect x="12" y="10" width="8" height="12" rx="2" fill="F"/><circle cx="16" cy="6" r="3"/><path d="M16 9v1"/>',
  notebook:'<path d="M16 8c-4-2-8-2-12-1v18c4-1 8-1 12 1 4-2 8-2 12-1V7c-4-1-8-1-12 1z" fill="F"/><path d="M16 8v18M7 12h6M7 16h4M19 12h6M19 16h5M19 20h3"/>',
  stream:'<path d="M2 10c6 0 6 6 12 6s6-6 12-6h4M2 16c6 0 6 6 12 6s6-6 12-6h4"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="21" cy="18" r="1.4" fill="currentColor"/>',
  producer:'<path d="M4 28V14l7 4v-4l7 4v-4l7 4V6h4v22z" fill="F"/><path d="M9 23h4M17 23h4"/>',
  'semantic-model':'<circle cx="16" cy="16" r="4.5" fill="F"/><circle cx="6" cy="7" r="2.6"/><circle cx="26" cy="7" r="2.6"/><circle cx="6" cy="25" r="2.6"/><circle cx="26" cy="25" r="2.6"/><path d="M8 9l5 4M24 9l-5 4M8 23l5-4M24 23l-5-4"/>',
  library:'<path d="M5 27V7h5v20M10 27V5h5v22M16 27l3-20 5 1-3 19z" fill="F"/><path d="M3 27h26"/>',
  report:'<rect x="3" y="5" width="26" height="17" rx="2" fill="F"/><path d="M12 28h8M16 22v6"/><path d="M8 18v-4M12 18v-7M16 18v-5M20 18v-9M24 18v-6" stroke-width="2.2"/>',
  dashboard:'<rect x="3" y="5" width="26" height="19" rx="2" fill="F"/><path d="M6 18l5-5 4 3 5-6 6 4"/><path d="M12 28h8"/>',
  api:'<path d="M5 28V14a11 11 0 0 1 22 0v14" fill="F"/><path d="M10 28V15a6 6 0 0 1 12 0v13"/><path d="M3 28h26"/>',
  endpoint:'<rect x="4" y="9" width="14" height="14" rx="3" fill="F"/><path d="M18 13h6M18 19h6M24 11v10"/><path d="M8 14h6M8 18h4"/><path d="M27 16h3"/>',
  function:'<path d="M5 26V8l4-3h18v18l-4 3z" fill="F"/><path d="M17 8l-5 9h6l-3 7 7-10h-6l3-6z"/>',
  queue:'<rect x="3" y="20" width="26" height="5" rx="2.5"/><rect x="6" y="13" width="6" height="6" fill="F"/><rect x="14" y="13" width="6" height="6" fill="F"/><rect x="22" y="15" width="4" height="4" fill="F"/>',
  identity:'<circle cx="11" cy="16" r="6" fill="F"/><circle cx="11" cy="16" r="2"/><path d="M17 16h12M24 16v4M28 16v3"/>',
  'ci-runner':'<circle cx="16" cy="16" r="6" fill="F"/><path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8"/><path d="M13.5 16l2 2 3.5-4"/>',
  'static-host':'<rect x="5" y="4" width="22" height="7" rx="1.5" fill="F"/><rect x="5" y="13" width="22" height="7" rx="1.5" fill="F"/><rect x="5" y="22" width="22" height="7" rx="1.5" fill="F"/><path d="M9 7.5h2M9 16.5h2M9 25.5h2"/>',
  browser:'<rect x="3" y="6" width="26" height="20" rx="2" fill="F"/><path d="M3 11h26"/><circle cx="7" cy="8.5" r=".8"/><circle cx="10" cy="8.5" r=".8"/><path d="M7 16h12M7 20h8"/>',
  app:'<rect x="8" y="3" width="16" height="26" rx="3" fill="F"/><rect x="11" y="8" width="4" height="4" rx="1"/><rect x="17" y="8" width="4" height="4" rx="1"/><rect x="11" y="14" width="4" height="4" rx="1"/><rect x="17" y="14" width="4" height="4" rx="1"/><path d="M14 25h4"/>',
  users:'<circle cx="11" cy="10" r="4" fill="F"/><circle cx="22" cy="11" r="3.3" fill="F"/><path d="M3 27c0-5 4-8 8-8s8 3 8 8M17 21c1-2 3-3 5-3 4 0 7 3 7 7"/>',
  user:'<circle cx="16" cy="10" r="5" fill="F"/><path d="M6 28c0-6 4.5-10 10-10s10 4 10 10"/>',
  device:'<path d="M16 28V12"/><rect x="11" y="18" width="10" height="7" rx="1.5" fill="F"/><path d="M10 7a8 8 0 0 1 12 0M12.5 10a4.5 4.5 0 0 1 7 0"/><circle cx="16" cy="12" r="1.2" fill="currentColor"/>',
  alert:'<path d="M16 4c5 0 8 4 8 9v6l3 4H5l3-4v-6c0-5 3-9 8-9z" fill="F"/><path d="M13 26a3 3 0 0 0 6 0"/>',
  external:'<path d="M9 24a6 6 0 0 1-.6-12A8 8 0 0 1 24 11a5.5 5.5 0 0 1 .5 13z" fill="F"/><path d="M13 19h7M17 16l3 3-3 3"/>'
};
export const FLAT_GLYPHS:readonly string[]=Object.keys(g);
export function flatGlyph(name:string,fill:string):string{return (g[name]??g.external).replaceAll('"F"','"'+fill+'"');}
