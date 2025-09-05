// states/play.js
import { createWorld } from '../world/world.js';
import { Sea } from '../world/Sea.js';
import { Sky } from '../world/Sky.js';
import { AirPlane } from '../entities/AirPlane.js';
import { Coins } from '../entities/Coins.js';
import { Enemies } from '../entities/Enemies.js';

window.GameStates = window.GameStates || {};

window.GameStates.play = {
  enter(ctx){
    ctx.fader?.fadeOut?.(0.5);

    // Scene content
    const world   = createWorld(ctx);
    const sea     = new Sea(ctx);
    const sky     = new Sky(ctx);
    const plane   = new AirPlane(ctx);
    const coins   = new Coins(ctx);
    const enemies = new Enemies(ctx);

    world.add(sea.mesh);
    world.add(sky.mesh);
    world.add(plane.group);
    world.add(coins.group);
    world.add(enemies.group);

    Object.assign(this, { world, sea, sky, plane, coins, enemies });

    // Looping SFX
    ctx.audio?.play?.('engine-loop');

    // Input
    this.offMove = ctx.pointer?.on?.('move', p => plane.setTargetFromPointer?.(p));
    this.offKey  = ctx.keyboard?.on?.('KeySpace', 'down', () => plane.shoot?.());

    // Score/level HUD
    this.score = 0; this.level = 1;
    ctx.text?.set?.('#score', '0');
    ctx.text?.set?.('#level', 'Level 1');

    // Callbacks captured on the state object
    this.addScore = (n=1) => {
      this.score += n;
      ctx.text?.set?.('#score', String(this.score));
      ctx.audio?.playOnce?.('coin-pickup');
      if (this.score > this.level * 20) {
        this.level++;
        ctx.text?.set?.('#level', 'Level ' + this.level);
      }
    };

    this.hitPlayer = () => {
      ctx.audio?.playOnce?.('hit');
      plane.takeHit?.();
      if (plane.hp <= 0) this.gameOver(ctx);
    };

    // Frame update
    this.offFrame = ctx.time?.onFrame?.(dt => {
      world.update?.(dt);
      sea.update?.(dt);
      sky.update?.(dt);
      plane.update?.(dt);
      coins.update?.(dt, plane, this.addScore);
      enemies.update?.(dt, plane, this.hitPlayer);
    });
  },

  gameOver(ctx){
    ctx.audio?.stop?.('engine-loop');
    const go = () => ctx.api?.send?.('GAME_OVER');
    const fx = ctx.fader?.fadeIn?.(0.5);
    if (fx && typeof fx.then === 'function') fx.then(go); else go();
  },

  exit(ctx){
    this.offFrame?.(); this.offMove?.(); this.offKey?.();
    const scene = ctx.three?.scene;
    [this.sea, this.sky, this.plane, this.coins, this.enemies]
      .forEach(o => o?.dispose?.());
    scene?.clear?.();
  },

  on: { GAME_OVER: 'gameover' }
};