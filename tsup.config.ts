import { defineConfig } from 'tsup';

/**
 * Build outputs:
 * - ESM:   dist/usm.esm.js
 * - CJS:   dist/usm.cjs
 * - UMD/IIFE global: window.USM (dist/usm.global.js + min)
 * Plus per-adapter entries for tree-shaking & direct imports.
 */
export default defineConfig({
  entry: {
    'usm': 'src/index.ts',
    'adapters/three':     'src/adapters/three/index.ts', // barrel (exports core + fx)
    'adapters/three-fx':  'src/adapters/three/fx.ts',    // optional separate file
    'adapters/gsap': 'src/adapters/gsap.ts',
    'adapters/keyboard': 'src/adapters/keyboard.ts',
    'adapters/pointer': 'src/adapters/pointer.ts',
    'adapters/ui': 'src/adapters/ui.ts',
    'adapters/fader': 'src/adapters/fader.ts',
    'adapters/debug': 'src/adapters/debug.ts',
    'adapters/loader': 'src/adapters/loader.ts',
    'adapters/audio': 'src/adapters/audio.ts',
    'adapters/time': 'src/adapters/time.ts',
    'adapters/picking': 'src/adapters/picking.ts',
    'adapters/scroll': 'src/adapters/scroll.ts',
    'adapters/tween': 'src/adapters/tween.ts',
    'adapters/text': 'src/adapters/text.ts',
    'adapters/anim': 'src/adapters/anim.ts',
  // (leave other adapters as they are)
  },
  format: ['esm', 'cjs', 'iife'],
  globalName: 'USM',          // window.USM
  dts: true,                  // emit .d.ts
  sourcemap: true,
  minify: true,
  clean: true,
  splitting: false,           // simpler CDN artifacts
  treeshake: true,
  external: ['three', 'gsap']
});
