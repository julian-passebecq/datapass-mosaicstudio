/** Resolve trusted client styles during Node validation, without executing CSS. */
import path from 'node:path';
import {createRequire} from 'node:module';
export function nodeValidationStyles(){
  return {name:'node-validation-styles',setup(builder){
    // A missing local/package stylesheet must remain an actionable source error.
    // Actual styles are still loaded normally by Vite in development/production.
    builder.onResolve({filter:/\.css$/},args=>({
      path:createRequire(path.join(args.resolveDir,'__studio_validation__.cjs')).resolve(args.path),
      namespace:'studio-style'
    }));
    builder.onLoad({filter:/.*/,namespace:'studio-style'},()=>({contents:'export {};',loader:'js'}));
  }};
}
