export type Publication={format:'datapass.publication';version:1;visibility:'preview'|'public';language:string;title:string;description:string;canonicalUrl?:string;image?:string};
export function validatePublication(input:unknown,defaults:{title:string;description?:string}):Readonly<Publication>;
export function readPublication(clientRoot:string,defaults:{title:string;description?:string}):Promise<Readonly<Publication>>;
export function publicationHead(profile:Publication):string;
export function publicationFiles(profile:Publication):Record<string,string>;
