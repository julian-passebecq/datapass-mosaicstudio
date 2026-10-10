/** datapass.artifact v1 bounds shared by the JSON Schema generator and the TypeScript validator.
 *  py/datapass_artifact.py mirrors the same numbers; tests/artifact-corpus.test.mjs proves the three agree. */
export const ARTIFACT_LIMITS=Object.freeze({
  bytes:1048576,rows:10000,columns:40,representations:12,
  inputs:24,evidence:8,dependsOn:12,line:100000,path:260,
});
/** Relative, forward-slash evidence path: no drive, no backslash, no control character, no empty, "." or ".." segment. */
export const SAFE_EVIDENCE_PATH=/^(?!\.{1,2}(?:\/|$))[^/\\:\u0000-\u001f\u007f]+(?:\/(?!\.{1,2}(?:\/|$))[^/\\:\u0000-\u001f\u007f]+)*$/u;
/** "Not blank" = at least one character outside the ECMAScript WhiteSpace/LineTerminator set (String.prototype.trim). */
export const NON_BLANK=/\S/u;
