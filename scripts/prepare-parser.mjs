import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('public/vendor',{recursive:true});
// Preserve the installed parser's complete public API and every dialect. Packaging
// it once avoids Rollup reparsing the large generated CommonJS grammar graph.
await build({stdin:{contents:"import parser from 'node-sql-parser'; export const Parser=parser.Parser; export const util=parser.util; export default parser;",resolveDir:process.cwd(),sourcefile:'full-sql-parser-entry.js'},bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'eof',outfile:'public/vendor/sql-parser.mjs'});
console.log('Prepared the complete SQL parser as a same-origin ESM dependency.');
