import {validateMotion, type MotionSpec} from './model.ts';

/** Explicit, validated and non-mutating. No silent downgrade or inferred choreography. */
export function migrateMotion(input: unknown, targetVersion: 2): MotionSpec {
  if (targetVersion !== 2) throw new Error('Only an explicit migration to motion v2 is supported');
  const source = validateMotion(input);
  // V2 without timing windows uses the same cubic curve over the full step as V1.
  return validateMotion({...source, version: 2});
}
