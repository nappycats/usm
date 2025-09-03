# USM – Universal State Machine (TypeScript)

Tiny, predictable finite-state machine (FSM) for games, 3D sites, and interactive apps.  
Ships as **ESM + CJS + UMD** with full type declarations. Includes adapters for **Three.js**, **keyboard**, **pointer**, and **UI**.

**Why TS?** Clear APIs + great IntelliSense + safer releases — but users still get plain JavaScript at runtime.

---

## Install
```bash
npm i @nappycat/usm
```

## Quick start (ESM)
```ts
import { USM } from '@nappycat/usm';

type Ctx = { score: number };
const machine = new USM<Ctx>({
  id: 'demo',
  initial: 'menu',
  context: { score: 0 },
  states: {
    menu: { on: { START: 'play' } },
    play: {
      enter(ctx){ ctx.score = 0; },
      tick(dt, ctx){ /* game loop here */ },
      on: { GAME_OVER: 'over' }
    },
    over: { on: { RESTART: 'play' } }
  }
});
machine.start();
```

## Adapters
- `threeAdapter({ THREE, scene, camera, renderer, mode:'container'|'window' })`  
  Handles DPR clamp + resize + camera.aspect updates.
- `keyboardAdapter({ down, up, preventRepeat, combo })`  
  Tracks `Set<string>` of pressed keys (`KeyboardEvent.code`), dispatches events.
- `pointerAdapter({ target, bind, onDrag, onTap, onWheel })`  
  Unifies mouse/touch/pen, swipe detection, wheel.
- `uiAdapter()`  
  Syncs `<body data-state="...">` for CSS.

```ts
import { adapters } from '@nappycat/usm';
// machine = new USM({ ..., adapters: [ adapters.keyboardAdapter({...}), ... ] })
```

## CDN / UMD usage
```html
<script src="https://cdn.jsdelivr.net/npm/@nappycat/usm/dist/usm.global.js"></script>
<script>
  const { USM, adapters } = window.USM;
  const m = new USM({ initial:'menu', states:{ menu:{ on:{ START:'play' } }, play:{} } });
  m.start();
</script>
```

## License
MIT © nappycat
