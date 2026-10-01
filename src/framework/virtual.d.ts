declare module 'virtual:studio-clients' {
  export const clientIds:string[];
  export const selectedClient:string|null;
  export const clients:Record<string,()=>Promise<{default:import('./types').AppDefinition}>>;
}
