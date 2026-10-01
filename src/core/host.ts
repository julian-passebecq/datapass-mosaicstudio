/** Host ports carry explicit capabilities; a VSIX is not an Electron webpage. */
export type HostKind = 'browser' | 'electron' | 'vscode';
export interface HostCapabilities {
  kind: HostKind;
  localFilePicker: boolean;
  nativeDuckLake: boolean;
  pythonKernel: boolean;
  openSourceLocation: boolean;
}
export interface SourceLocation { artifactId: string; relativePath: string; line?: number; }
export interface StudioHost {
  capabilities: HostCapabilities;
  saveDownload(name: string, bytes: Blob): void;
  openSource?(location: SourceLocation): Promise<void>;
}
export const browserCapabilities: HostCapabilities = Object.freeze({kind: 'browser', localFilePicker: true, nativeDuckLake: false, pythonKernel: false, openSourceLocation: false});
export function safeRelativePath(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && path.length <= 500 && !/[\\\0:]/.test(path) && !path.startsWith('/') && path.split('/').every(part => part !== '..' && part !== '.' && part !== '');
}
export function createBrowserHost(): StudioHost {
  return { capabilities: browserCapabilities, saveDownload(name, bytes) {
    const url = URL.createObjectURL(bytes), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name.replace(/[\\/\0]/g, '_'); anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }};
}
export interface StudioModule {
  id: string; title: string; description: string;
  kind: 'data' | 'authoring' | 'explanation' | 'business';
  status: 'implemented' | 'planned';
  engine: string;
}
export const modules: readonly StudioModule[] = [
  {id:'explore',title:'Data explorer',description:'Local files, schema, profile and rows',kind:'data',status:'implemented',engine:'SQLRooms / DuckDB-WASM'},
  {id:'linked',title:'Linked views',description:'Coordinated brushing and cross-filtering',kind:'data',status:'implemented',engine:'SQLRooms / UWData Mosaic'},
  {id:'sql',title:'SQL workspace',description:'Query editor and real local results',kind:'authoring',status:'implemented',engine:'SQLRooms SQL Editor'},
  {id:'pipeline',title:'Pipeline designer',description:'Static ADF-style graph, code and validation',kind:'authoring',status:'implemented',engine:'React Flow / DataPass'},
  {id:'stories',title:'Visual stories',description:'Existing analytical D3 stories',kind:'explanation',status:'implemented',engine:'VizForge'},
  {id:'explain',title:'Concept lab',description:'Semantic algorithm explanation',kind:'explanation',status:'implemented',engine:'ConceptMotion'},
  {id:'board',title:'Project board',description:'A non-SQL consumer of the same workspace',kind:'business',status:'implemented',engine:'DataPass'},
  {id:'architecture',title:'Architecture review',description:'System map, schema drift and stakeholder presentation',kind:'explanation',status:'implemented',engine:'React Flow / DataPass architecture artifacts'},
];
