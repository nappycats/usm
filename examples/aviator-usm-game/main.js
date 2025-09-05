// main.js (ESM) — USM boot with staged progress (20% imports, 80% assets)
// States first (they populate window.GameStates)
import './states/boot.js';
import './states/loading.js';
import './states/menu.js';
import './states/play.js';
import './states/gameover.js';

(async function boot() {
  // --- UI helpers available BEFORE USM exists (for boot progress)
  const barFill = document.querySelector('#progress .fill');
  const barText = document.querySelector('#progress .label');
  const hintEl  = document.querySelector('#loading-hint, #hint');
  const setBar  = (pct) => { if (barFill) barFill.style.width = pct + '%'; if (barText) barText.textContent = pct + '%'; };
  const setHint = (t)   => { if (hintEl)  hintEl.textContent = t; };
  const clamp   = (x)   => Math.max(0, Math.min(100, Math.round(x)));

  // Reserve first N% for module imports
  const BOOT_MAX = 20; // you can tweak this
  window.__USM_BOOT_BASE__ = 0; // loading.js will read this when assets start

  setHint(`Booting… 0%`);
  setBar(0);

  // Build a list of dynamic imports so we can show progress as they load
  let USMmod, loaderMod, uiCoreMod, uiPagesMod, uiScenesMod, uiWidgetsMod,
      timeMod, tweenMod, threeMod, pointerMod, keyboardMod, audioMod, faderMod, textMod, debugMod;

  const tasks = [
    { name: 'usm',          run: async ()=> { USMmod       = await import('/dist/usm.js'); } },
    { name: 'loader',       run: async ()=> { loaderMod    = await import('/dist/adapters/loader.js'); } },
    { name: 'ui-core',      run: async ()=> { uiCoreMod    = await import('/dist/adapters/ui.js'); } },
    { name: 'ui-pages',     run: async ()=> { uiPagesMod   = await import('/dist/adapters/ui.js'); } },
    { name: 'ui-scenes',    run: async ()=> { uiScenesMod  = await import('/dist/adapters/ui.js'); } },
    { name: 'ui-widgets',   run: async ()=> { uiWidgetsMod = await import('/dist/adapters/ui.js'); } },
    { name: 'time',         run: async ()=> { timeMod      = await import('/dist/adapters/time.js'); } },
    { name: 'tween',        run: async ()=> { tweenMod     = await import('/dist/adapters/tween.js'); } },
    { name: 'three',        run: async ()=> { threeMod     = await import('/dist/adapters/three.js'); } },
    { name: 'pointer',      run: async ()=> { pointerMod   = await import('/dist/adapters/pointer.js'); } },
    { name: 'keyboard',     run: async ()=> { keyboardMod  = await import('/dist/adapters/keyboard.js'); } },
    { name: 'audio',        run: async ()=> { audioMod     = await import('/dist/adapters/audio.js'); } },
    { name: 'fader',        run: async ()=> { faderMod     = await import('/dist/adapters/fader.js'); } },
    { name: 'text',         run: async ()=> { textMod      = await import('/dist/adapters/text.js'); } },
    { name: 'debug',        run: async ()=> { debugMod     = await import('/dist/adapters/debug.js'); } },
  ];

  for (let i = 0; i < tasks.length; i++){
    const t = tasks[i];
    try {
      await t.run();
    } catch (err) {
      console.error(`[boot] Failed to import ${t.name}:`, err);
      setHint(`Boot error: ${t.name}`);
      throw err;
    }
    const pct = clamp(((i+1) / tasks.length) * BOOT_MAX);
    setHint(`Booting… ${pct}%`);
    setBar(pct);
    window.__USM_BOOT_BASE__ = pct; // let loading.js know where to start from
  }

  // Helper to extract factories from modules (named → default[named] → default if callable)
  function getExport(mod, names = []){
    for (const n of names){
      if (mod && typeof mod[n] !== 'undefined') return mod[n];
      if (mod?.default && typeof mod.default[n] !== 'undefined') return mod.default[n];
    }
    if (typeof mod?.default === 'function') return mod.default;
    return undefined;
  }

  // ---- Resolve USM + adapters
  const Machine          = getExport(USMmod,      ['USM','Machine']);
  const loaderAdapter    = getExport(loaderMod,   ['loaderAdapter']);
  const uiAdapter        = getExport(uiCoreMod,   ['uiAdapter']);
  const uiPagesAdapter   = getExport(uiPagesMod,  ['uiPagesAdapter']);
  const uiScenesAdapter  = getExport(uiScenesMod, ['uiScenesAdapter']);
  const uiWidgetsAdapter = getExport(uiWidgetsMod,['uiWidgetsAdapter']);
  const timeAdapter      = getExport(timeMod,     ['timeAdapter']);
  const tweenAdapter     = getExport(tweenMod,    ['tweenAdapter']);
  const threeAdapter     = getExport(threeMod,    ['threeAdapter']);
  const pointerAdapter   = getExport(pointerMod,  ['pointerAdapter']);
  const keyboardAdapter  = getExport(keyboardMod, ['keyboardAdapter']);
  const audioAdapter     = getExport(audioMod,    ['audioAdapter']);
  const faderAdapter     = getExport(faderMod,    ['faderAdapter']);
  const textAdapter      = getExport(textMod,     ['textAdapter']);
  const debugAdapter     = getExport(debugMod,    ['debugAdapter']);

  if (!Machine) {
    console.error('USM module exports:', Object.keys(USMmod), 'default=', USMmod.default);
    throw new Error("Cannot find a USM constructor in /dist/usm.js (expected 'USM' or 'Machine').");
  }

  // Sanity: critical adapters must be functions
  const required = { timeAdapter, tweenAdapter, threeAdapter, pointerAdapter, keyboardAdapter, audioAdapter, loaderAdapter, faderAdapter, uiAdapter, textAdapter };
  for (const [k,v] of Object.entries(required)) {
    if (typeof v !== 'function') throw new Error(`Adapter missing or wrong export: ${k}`);
  }

  // ---- Build machine
  const m = new Machine({
    adapters: [
      timeAdapter({ fixedStep: 1/60 }),
      tweenAdapter(),
      threeAdapter({
        THREE: await import('https://unpkg.com/three@0.161.0/build/three.module.js'),
        mode: 'window',          // full screen canvas
        clearColor: 0x0b1020,
        autoRender: true,
      }),
      pointerAdapter({ element: () => document.body }),
      keyboardAdapter(),
      audioAdapter(),
      loaderAdapter(),
      faderAdapter(),
      uiAdapter({ prehideId: 'usm-prehide' }),
      // Optional UI helpers (uncomment if your DOM has those structures)
      // uiPagesAdapter && uiPagesAdapter({ transition: 'fade', duration: 0.35, useHash: true, initial: 'menu' }),
      uiScenesAdapter && uiScenesAdapter({ transition: 'fader', initial: 'loading' }),
      // uiWidgetsAdapter && uiWidgetsAdapter({ autoStyles: true }),
      textAdapter(),
      debugAdapter({ position: 'bottom-left', margin: 16 }),
    ].filter(Boolean),
    initial: 'boot',
    states: {
      boot:     window.GameStates.boot,
      loading:  window.GameStates.loading,
      menu:     window.GameStates.menu,
      play:     window.GameStates.play,
      gameover: window.GameStates.gameover,
    }
  });

  // Expose for console debugging
  window.m = m;

  // GO
  m.start();
})().catch(err => {
  console.error('[main.js] Boot failed:', err);
});