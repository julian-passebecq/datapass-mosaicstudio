declare module 'virtual:studio-clients' {
  export const clientIds:string[];
  /** F213 catalog label per client id, read from clients/<id>/client.config.json. */
  export const clientStatus:Record<string,'reference'|'prototype'|'draft'|'frozen'>;
  export const selectedClient:string|null;
  export const clients:Record<string,()=>Promise<{default:import('./types').AppDefinition}>>;
}
