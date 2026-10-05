/** Shape of stats.generated.ts (written by tools/stats.mjs from this repository). */
export type RepoStats={
  format:'portfolio.repo-stats';version:1;
  clients:{count:number;ids:string[]};
  framework:{files:number;lines:number};
  tests:{files:number;declared:number;run:{total:number;pass:number;fail:number;platform:string;date:string}|null};
  bundles:{vizCoreGzipBytes:number;vizCoreBudgetBytes:number;reference:{id:string;gzipBytes:number}[];source:string};
  git:{commits:number;activity:{date:string;commits:number}[];lastCommit:string};
  prs:number|null;
};
