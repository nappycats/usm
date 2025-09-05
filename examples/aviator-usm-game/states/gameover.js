// states/gameover.js
window.GameStates = window.GameStates || {};

window.GameStates.gameover = {
  enter(ctx){
    const btn = document.getElementById('btnRetry');
    const onRetry = () => ctx.api?.send?.('RETRY');
    if (btn) btn.onclick = onRetry;
    this._detach = () => { if (btn) btn.onclick = null; };

    ctx.fader?.fadeOut?.(0.4);
  },
  exit(){
    this._detach?.(); this._detach = null;
  },
  on: { RETRY: 'play' }
};