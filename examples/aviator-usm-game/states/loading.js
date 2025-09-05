// states/loading.js
window.GameStates = window.GameStates || {};

window.GameStates.loading = {
  async enter(ctx, evt, api){
    // Optional: if loader ui-prehide is enabled, ensure only the loading page is visible
    try { ctx.loader?.showPage?.('loading'); } catch {}

    // Elements (optional):
    //  - #hint: text label we already use
    //  - #progress .fill: a progress bar fill if you add it in HTML/CSS
    const hintSel = '#loading-hint, #hint';
    const barFill = document.querySelector('#progress .fill');
    const barText = document.querySelector('#progress .label');

    const setHint = (t) => ctx.ui?.setText?.(hintSel, t);
    const setBar  = (pct) => {
      if (barFill) (barFill).style.width = pct + '%';
      if (barText) (barText).textContent = pct + '%';
    };

    // Boot-offset support: main.js can reserve the first N% for JS imports
    const base   = Math.max(0, Math.min(100, Number(window.__USM_BOOT_BASE__ || 0))); // e.g. 20
    const weight = Math.max(0, 100 - base); // remaining (% for real assets)

    // Clamp + round helper
    const clampPct = (x) => Math.max(0, Math.min(100, Math.round(x)));

    // Live progress values
    let total = 0, done = 0;
    const update = () => {
      const frac = total > 0 ? (done / total) : 1; // 0..1 for assets
      const pct  = clampPct(base + frac * weight);
      setHint(`Loading… ${pct}%`);
      setBar(pct);
    };

    // Initialize UI to base (so we don't jump backwards from the boot phase)
    setHint(`Loading… ${clampPct(base)}%`);
    setBar(clampPct(base));

    // Wire loader callbacks
    const resetProgress = () => { total = 0; done = 0; update(); };
    resetProgress();

    ctx.loader?.onProgress?.((d, t /*, name*/)=>{ done = d; total = t; update(); });
    ctx.loader?.onError?.((name, err)=>{
      console.error('[loader] failed:', name, err);
      setHint(`Error loading: ${name}`);
    });

    // Start loading your manifest
    await ctx.loader?.load?.({
      images: [ { id: 'nc-logo', src: 'assets/images/nc-logo.png' } ],
      sounds: [
        'assets/sfx/coin-pickup.mp3',
        'assets/sfx/airplane-crash-1.mp3',
        'assets/sfx/engine-loop.mp3'
      ],
      models: [ /* add GLB/GLTF as needed */ ]
    });

    // Ensure we end at 100%
    done = total; update();
    await new Promise(r => setTimeout(r, 150)); // let users see 100%

    // Clear hint and advance
    setHint('');
    api?.send?.('READY');
  },

  exit(ctx){
    // Optional cleanup
    ctx.loader?.onProgress?.(()=>{});
    ctx.ui?.setText?.('#hint', '');
    const barFill = document.querySelector('#progress .fill');
    if (barFill) barFill.style.width = '0%';
    const barText = document.querySelector('#progress .label');
    if (barText) barText.textContent = '';
  },

  on: { READY: 'menu' }
};