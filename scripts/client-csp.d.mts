export type ClientCspOptions={wasm:boolean;connect:string[]};
export const MAX_CONNECT_ORIGINS:number;
export function validateClientCsp(value:unknown):ClientCspOptions;
export function clientCsp(options?:ClientCspOptions):string;
export function clientCspFor(clientDir:string):string;
