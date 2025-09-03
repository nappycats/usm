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
    'adapters/three': 'src/adapters/three.ts',
    'adapters/keyboard': 'src/adapters/keyboard.ts',
    'adapters/pointer': 'src/adapters/pointer.ts',
    'adapters/ui': 'src/adapters/ui.ts',
    'adapters/fader': 'src/adapters/fader.ts',
    'adapters/debug': 'src/adapters/debug.ts'
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
