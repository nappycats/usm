// states/boot.js
window.GameStates = window.GameStates || {};

window.GameStates.boot = {
  async enter(ctx, evt, api){
    console.log('Entering BOOT state');

    // --- UI title (optional if ui/text adapters aren’t loaded)
    try {
      // ctx.text?.type?.('#title', 'NAPPY CAT', { speed: 10, charset:'@#$%^&*><?":ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    } catch(e) { /* noop */ }

    // --- Three defaults (optional)
    try {
      const t = ctx.three;
      if (t?.camera && t?.renderer) {
        t.camera.position.set(0, 100, 200);
        t.renderer.setClearColor?.(0x0b1020, 1);
      }
    } catch(e) { /* noop */ }

    // --- Move on: schedule NEXT so enter() finishes cleanly first
    api?.send?.('NEXT');
    // ctx.fader.fadeBetween(0.35, 'NEXT', 0.35);
  },
  // exit(ctx){
  // },
  on: { NEXT: 'loading' }
};