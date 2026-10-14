export declare const WORKBENCH_CSP: string;
export declare const WORKBENCH_HEADERS: Record<'Content-Security-Policy'|'X-Content-Type-Options'|'Referrer-Policy', string>;
export declare function workbenchHeadersFile(): string;
export declare function parseHeadersFile(text: string): Record<string, Record<string, string>>;
