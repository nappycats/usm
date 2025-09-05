// states/menu.js
window.GameStates = window.GameStates || {};

window.GameStates.menu = {
  enter(ctx){
    ctx.ui?.setText?.('#title', 'THE AVIATOR');
    ctx.text?.scramble?.('#title', 'THE AVIATOR', { speed: 10, charset:'@#$%^&*><?":ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    ctx.ui?.setText?.('#hint', 'Use mouse to steer. Space to shoot.');

    const btn = document.getElementById('btnPlay');
    const onPlay = () => ctx.api?.send?.('PLAY');
    if (btn) btn.onclick = onPlay;
    this._detach = () => { if (btn) btn.onclick = null; };

    // Gentle camera bob (optional)
    const cam = ctx.three?.camera;
    if (cam && ctx.tween?.to){
      const s = { y: cam.position.y };
      ctx.tween.to(s, { y: 110 }, {
        duration: 2, ease: 'sineInOut',
        onUpdate: () => cam.position.y = s.y
      });
    }
  },
  exit(){
    this._detach?.(); this._detach = null;
  },
  on: { PLAY: 'play' }
};  