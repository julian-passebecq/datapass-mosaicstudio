/** Client-owned token overrides (the framework defaults stay Fluent-like neutral).
 * A dense dark analytics canvas with a teal accent; no third-party branding.
 */
import type {TokenOverrides} from '../../src/framework/viz/tokens.ts';
export const THEMES:{light:TokenOverrides;dark:TokenOverrides}={
  light:{canvas:'#f3f4f6',surface:'#ffffff',surfaceRaised:'#f8f9fa',border:'#e3e5e8',accent:'#0b7a70',accentSubtle:'#e3f4f2',selection:'#0b7a70'},
  dark:{canvas:'#0c0f13',surface:'#141820',surfaceRaised:'#1a1f28',surfaceHover:'#212733',border:'#242b36',borderStrong:'#323b48',grid:'#1f2630',axis:'#3a4452',inkMuted:'#8b95a3',accent:'#2ec4b6',accentInk:'#04110f',accentSubtle:'#0f2e2c',selection:'#2ec4b6',tooltip:'#1b2029',shimmer:'#1a1f27',shimmerHighlight:'#242a34'},
};
